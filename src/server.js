// server.js
import express from "express";
import cors from "cors";
import mysql from "mysql";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";

dotenv.config();

// ----------- CONSTANTS / CONFIG -----------
const BOT_BASE_URL = process.env.BOT_URL;
const CURRENT_VERSION = process.env.TLOGI_VERSION || "1.0.0";
const UPDATE_FEED_URL =
  process.env.TLOGI_UPDATE_FEED || "https://raw.githubusercontent.com/llallenll/tlogi-ticketing/refs/heads/main/changelog.json";

const USE_DOMAIN =
  String(process.env.USE_DOMAIN || "true").toLowerCase() === "true";

// Frontend origin for CORS + redirect targets
const FRONTEND_ORIGIN = USE_DOMAIN
  ? `${process.env.FRONTEND_DOMAIN}`
  : `http://${process.env.HOST || "localhost"}:${process.env.FRONTEND_PORT}`;

// API base for OAuth callback, links, etc.
const API_BASE = USE_DOMAIN
  ? `${process.env.API_DOMAIN}`
  : `http://${process.env.HOST || "localhost"}:${process.env.WEBHOOK_PORT}`;

const PORT = Number(process.env.WEBHOOK_PORT);

// ----------- EXPRESS SETUP -----------
const app = express();

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

// ----------- MYSQL POOL -----------
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 5,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Error connecting to MySQL:", err);
  } else {
    console.log("✅ Connected to MySQL");
    conn.release();
  }
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// ----------- SESSION + PASSPORT SETUP -----------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "tlogi-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "lax",
      secure: false, // set true behind HTTPS/proxy in prod
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Discord OAuth
passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: `${API_BASE}/auth/discord/callback`,
      scope: ["identify"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const discordId = profile.id;
        const username = profile.username;
        const avatar = profile.avatar || null;

        // Upsert into users table
        await query(
          `
          INSERT INTO users (discord_user_id, username, avatar)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            avatar = VALUES(avatar)
        `,
          [discordId, username, avatar]
        );

        const user = { discordId, username, avatar };
        return done(null, user);
      } catch (err) {
        console.error("DiscordStrategy error:", err);
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.discordId);
});

passport.deserializeUser(async (id, done) => {
  try {
    const rows = await query(
      "SELECT discord_user_id, username, avatar FROM users WHERE discord_user_id = ?",
      [id]
    );
    if (rows.length === 0) return done(null, false);
    const row = rows[0];
    done(null, {
      discordId: row.discord_user_id,
      username: row.username,
      avatar: row.avatar,
    });
  } catch (err) {
    done(err);
  }
});

// ----------- AUTH MIDDLEWARE -----------
function ensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

async function ensureStaff(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const discordId = req.user.discordId;
    const rows = await query(
      "SELECT role, is_super_admin FROM staff_users WHERE discord_user_id = ?",
      [discordId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: "No access to dashboard" });
    }

    const staffRow = rows[0];
    req.user.role = staffRow.role;
    req.user.is_super_admin =
      staffRow.is_super_admin === 1 || staffRow.is_super_admin === true;
    req.user.is_staff = true;

    next();
  } catch (err) {
    console.error("ensureStaff error:", err);
    res.status(500).json({ error: "Database error" });
  }
}

async function ensureSuperAdmin(req, res, next) {
  try {
    await new Promise((resolve, reject) =>
      ensureStaff(req, res, (err) => (err ? reject(err) : resolve()))
    );

    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Super admin required" });
    }

    next();
  } catch (err) {
    if (!res.headersSent) {
      console.error("ensureSuperAdmin error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
}

// ----------- AUTH ROUTES -----------
app.get("/auth/discord", passport.authenticate("discord"));

app.get(
  "/auth/discord/callback",
  passport.authenticate("discord", {
    failureRedirect: `${FRONTEND_ORIGIN}/login-failed`,
  }),
  (req, res) => {
    res.redirect(FRONTEND_ORIGIN);
  }
);

// Current user
app.get("/auth/me", async (req, res) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const discordId = req.user.discordId;
    const rows = await query(
      "SELECT role, is_super_admin FROM staff_users WHERE discord_user_id = ?",
      [discordId]
    );

    const isStaff = rows.length > 0;
    const isSuper =
      isStaff &&
      (rows[0].is_super_admin === 1 || rows[0].is_super_admin === true);

    const hasAccess = isStaff || isSuper;

    res.json({
      discordId: req.user.discordId,
      username: req.user.username,
      avatar: req.user.avatar,
      is_staff: isStaff,
      is_super_admin: isSuper,
      hasAccess,
    });
  } catch (err) {
    console.error("/auth/me error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Logout
app.post("/auth/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

// ----------- SETTINGS / ONBOARDING -----------
app.get("/settings", async (req, res) => {
  try {
    const settingsRows = await query("SELECT `key`, `value` FROM settings");
    const staffCountRows = await query(
      "SELECT COUNT(*) AS cnt FROM staff_users"
    );

    const settings = {};
    for (const row of settingsRows) {
      settings[row.key] = row.value;
    }

    const siteName = settings.site_name || null;
    const hasStaff = staffCountRows[0]?.cnt > 0;
    const needsOnboarding = !siteName;

    res.json({
      site_name: siteName,
      has_staff: hasStaff,
      needsOnboarding,
    });
  } catch (err) {
    console.error("GET /settings error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Set / update website name and create first super admin if none exist
app.post("/settings/site-name", ensureAuthenticated, async (req, res) => {
  try {
    const { siteName } = req.body || {};

    if (!siteName || typeof siteName !== "string" || !siteName.trim()) {
      return res.status(400).json({ error: "siteName is required" });
    }

    const cleanName = siteName.trim().slice(0, 100);

    await query(
      `
      INSERT INTO settings (\`key\`, \`value\`)
      VALUES ('site_name', ?)
      ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
    `,
      [cleanName]
    );

    // If no staff yet, make this user the first super admin
    const [{ cnt }] = await query(
      "SELECT COUNT(*) AS cnt FROM staff_users"
    );

    if (cnt === 0) {
      const discordId = req.user.discordId;
      await query(
        `
        INSERT INTO staff_users (discord_user_id, role, is_super_admin)
        VALUES (?, 'super_admin', 1)
        ON DUPLICATE KEY UPDATE
          role = VALUES(role),
          is_super_admin = VALUES(is_super_admin)
      `,
        [discordId]
      );
    }

    res.json({
      site_name: cleanName,
      needsOnboarding: false,
    });
  } catch (err) {
    console.error("POST /settings/site-name error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------- ADMIN: USER MANAGEMENT -----------
app.get("/admin/users", ensureSuperAdmin, async (req, res) => {
  try {
    const rows = await query(
      `
      SELECT
        u.discord_user_id AS discordId,
        u.username,
        u.avatar,
        s.role,
        s.is_super_admin
      FROM users u
      LEFT JOIN staff_users s
        ON s.discord_user_id = u.discord_user_id
      ORDER BY u.username ASC
    `
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /admin/users error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Set user as none / staff / super_admin
app.post(
  "/admin/users/:discordId/role",
  ensureSuperAdmin,
  async (req, res) => {
    try {
      const { discordId } = req.params;
      const { level } = req.body || {};

      if (!discordId) {
        return res.status(400).json({ error: "discordId is required" });
      }

      if (!["none", "staff", "super_admin"].includes(level)) {
        return res.status(400).json({ error: "Invalid level" });
      }

      if (level === "none") {
        await query("DELETE FROM staff_users WHERE discord_user_id = ?", [
          discordId,
        ]);
        return res.json({ discordId, level: "none" });
      }

      const isSuper = level === "super_admin" ? 1 : 0;
      const role = level === "super_admin" ? "super_admin" : "staff";

      await query(
        `
        INSERT INTO staff_users (discord_user_id, role, is_super_admin)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          role = VALUES(role),
          is_super_admin = VALUES(is_super_admin)
      `,
        [discordId, role, isSuper]
      );

      res.json({ discordId, level });
    } catch (err) {
      console.error("POST /admin/users/:discordId/role error:", err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

// ----------- ADMIN: UPDATE CHECK -----------
function compareSemver(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

app.get("/admin/updates", ensureSuperAdmin, async (req, res) => {
  try {
    let latestVersion = CURRENT_VERSION;
    let changelog = [];
    let feedError = null;

    if (UPDATE_FEED_URL) {
      try {
        const resp = await fetch(UPDATE_FEED_URL);
        if (!resp.ok) {
          throw new Error(`Update feed HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (data.latest) latestVersion = data.latest;
        if (Array.isArray(data.changelog)) changelog = data.changelog;
      } catch (err) {
        console.error("Update feed fetch error:", err);
        feedError = "Unable to reach update server.";
      }
    }

    const cmp = compareSemver(CURRENT_VERSION, latestVersion);
    const upToDate = cmp >= 0;

    res.json({
      currentVersion: CURRENT_VERSION,
      latestVersion,
      upToDate,
      changelog,
      feedError,
    });
  } catch (err) {
    console.error("GET /admin/updates error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------- TICKET ROUTES -----------

// Stats for dashboard
app.get("/tickets/stats", ensureStaff, async (req, res) => {
  try {
    const [row] = await query(
      `
      SELECT
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_tickets,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_tickets,
        COUNT(*) AS total_tickets
      FROM tickets
    `
    );

    res.json(
      row || { open_tickets: 0, closed_tickets: 0, total_tickets: 0 }
    );
  } catch (err) {
    console.error("/tickets/stats error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// List tickets
app.get("/tickets", ensureStaff, async (req, res) => {
  try {
    const tickets = await query(
      `
      SELECT
        id,
        subject,
        status,
        priority,
        discord_user_id,
        discord_channel_id,
        created_at
      FROM tickets
      ORDER BY created_at DESC
    `
    );

    res.json(tickets);
  } catch (err) {
    console.error("GET /tickets error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Single ticket
app.get("/tickets/:id", ensureStaff, async (req, res) => {
  const ticketId = req.params.id;

  try {
    const rows = await query("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /tickets/:id error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Ticket messages
app.get("/tickets/:id/messages", ensureStaff, async (req, res) => {
  const ticketId = req.params.id;

  try {
    const rows = await query(
      `
      SELECT
        tm.id,
        tm.discord_user_id,
        tm.message,
        tm.created_at,
        u.username
      FROM ticket_messages tm
      LEFT JOIN users u ON u.discord_user_id = tm.discord_user_id
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `,
      [ticketId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /tickets/:id/messages error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Staff reply from dashboard
app.post("/tickets/:id/messages", ensureStaff, async (req, res) => {
  const ticketId = req.params.id;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const staffDiscordId = req.user.discordId;
    const staffUsername = req.user.username;

    // Insert message into DB
    const result = await query(
      `
      INSERT INTO ticket_messages (ticket_id, discord_user_id, message, created_at)
      VALUES (?, ?, ?, NOW())
    `,
      [ticketId, staffDiscordId, message.trim()]
    );

    const insertedId = result.insertId;

    // Notify bot so it can send the message into the Discord ticket channel
    if (BOT_BASE_URL) {
      try {
        await fetch(`${BOT_BASE_URL}/staff-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          body: JSON.stringify({
            ticketId: Number(ticketId),
            staffUsername: staffUsername || "Staff",
            message: message.trim(),
          }),
        });
      } catch (botErr) {
        console.error("Failed to notify Discord bot of staff reply:", botErr);
      }
    }

    res.json({
      id: insertedId,
      ticket_id: Number(ticketId),
      discord_user_id: staffDiscordId,
      message: message.trim(),
      username: staffUsername,
    });
  } catch (err) {
    console.error("POST /tickets/:id/messages error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Delete a ticket message (super admin)
app.delete(
  "/tickets/:ticketId/messages/:messageId",
  ensureSuperAdmin,
  async (req, res) => {
    const { ticketId, messageId } = req.params;

    try {
      await query(
        "DELETE FROM ticket_messages WHERE id = ? AND ticket_id = ?",
        [messageId, ticketId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error(
        "DELETE /tickets/:ticketId/messages/:messageId error:",
        err
      );
      res.status(500).json({ error: "Database error" });
    }
  }
);

// Update ticket priority
app.post("/tickets/:id/priority", ensureStaff, async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body || {};

  if (!["low", "medium", "high"].includes(priority)) {
    return res.status(400).json({ error: "Invalid priority" });
  }

  try {
    await query("UPDATE tickets SET priority = ? WHERE id = ?", [
      priority,
      id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /tickets/:id/priority error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Close a ticket + generate transcript + notify bot
app.post("/tickets/:id/close", ensureStaff, async (req, res) => {
  const ticketId = req.params.id;

  try {
    // Load ticket
    const [ticket] = await query(
      "SELECT id, discord_user_id, public_token, status, subject, created_at FROM tickets WHERE id = ?",
      [ticketId]
    );

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Generate / reuse public token
    let publicToken = ticket.public_token;
    if (!publicToken) {
      publicToken = crypto.randomBytes(24).toString("hex");
    }

    // Mark closed
    await query(
      `
      UPDATE tickets
      SET status = 'closed',
          closed_at = NOW(),
          public_token = ?
      WHERE id = ?
    `,
      [publicToken, ticketId]
    );

    // Build transcript
    const messages = await query(
      `
      SELECT tm.message,
             tm.created_at,
             u.username
      FROM ticket_messages tm
      LEFT JOIN users u ON u.discord_user_id = tm.discord_user_id
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `,
      [ticketId]
    );

    const transcriptLines = messages.map((m) => {
      const ts = m.created_at
        ? new Date(m.created_at).toISOString()
        : "";
      const name = m.username || "Unknown user";
      return `[${ts}] ${name}: ${m.message}`;
    });

    const transcriptText =
      transcriptLines.length > 0
        ? transcriptLines.join("\n")
        : "No messages in this ticket.";

    const publicViewUrl = `${FRONTEND_ORIGIN}/view/${publicToken}`;

    // Notify Discord bot (DM transcript)
    if (BOT_BASE_URL) {
      try {
        await fetch(`${BOT_BASE_URL}/ticket-transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: Number(ticketId),
            discordUserId: String(ticket.discord_user_id),
            transcript: transcriptText,
            viewUrl: publicViewUrl,
          }),
        });

        await query("UPDATE tickets SET transcript_sent = 1 WHERE id = ?", [
          ticketId,
        ]);
      } catch (botErr) {
        console.error("Failed to notify Discord bot with transcript:", botErr);
      }
    }

    // 🔴 Ttell bot to delete the Discord channel
    if (BOT_BASE_URL) {
      try {
        await fetch(`${BOT_BASE_URL}/ticket-delete-channel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: Number(ticketId),
          }),
        });
      } catch (botErr) {
        console.error(
          "Failed to ask bot to delete ticket channel:",
          botErr
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST /tickets/:id/close error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Super admin: delete a ticket + messages
app.delete("/tickets/:id", ensureSuperAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await query("DELETE FROM ticket_messages WHERE ticket_id = ?", [id]);
    await query("DELETE FROM tickets WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /tickets/:id error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ----------- PUBLIC TRANSCRIPT -----------
app.get("/public/tickets/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const [ticket] = await query(
      `
      SELECT id, subject, status, created_at, closed_at
      FROM tickets
      WHERE public_token = ?
    `,
      [token]
    );

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const messages = await query(
      `
      SELECT tm.id,
             tm.message,
             tm.created_at,
             u.username
      FROM ticket_messages tm
      LEFT JOIN users u ON u.discord_user_id = tm.discord_user_id
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `,
      [ticket.id]
    );

    res.json({ ticket, messages });
  } catch (err) {
    console.error("GET /public/tickets/:token error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ----------- START SERVER -----------
app.listen(PORT, () => {
  console.log(`API running on ${API_BASE}`);
  console.log(`Callback running on ${API_BASE}/auth/discord/callback`);
});
