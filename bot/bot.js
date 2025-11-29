// bot.js
import "dotenv/config";
import express from "express";
import mysql from "mysql";
import crypto from "crypto";
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";

// ---------------- DOMAIN CHECK----------------

const useDomain =
  String(process.env.USE_DOMAIN || "true").toLowerCase() === "true";

const FRONTEND_BASE = useDomain
  ? process.env.FRONTEND_DOMAIN || "http://localhost:5173"
  : `http://${process.env.HOST || "localhost"}:${
      process.env.FRONTEND_PORT || 5173
    }`;

// ---------------- DB SETUP ----------------
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 5,

  // important for Discord IDs (snowflakes)
  supportBigNumbers: true,
  bigNumberStrings: true,
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// ---------------- DISCORD CLIENT ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
});

// Safety logs
client.on("error", (err) => {
  console.error("Discord client error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});

// ------------- HELPERS -------------

// Ticket panel embed + button
async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("Support Tickets")
    .setDescription(
      "Need help? Click the button below to open a private support ticket.\n\n" +
        "A new channel will be created that only you and staff can see."
    )
    .setColor(0x38bdf8)
    .setImage("https://cdn-icons-png.freepik.com/512/9485/9485493.png");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("Open Ticket")
      .setEmoji("📩")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// Create ticket: channel + DB row
async function createTicketForUser(user, subject = "New Ticket") {
  const guildId = process.env.DISCORD_GUILD_ID;
  const categoryId = process.env.DISCORD_TICKET_CATEGORY_ID;

  if (!guildId || !categoryId) {
    console.error(
      "Missing DISCORD_GUILD_ID or DISCORD_TICKET_CATEGORY_ID in .env"
    );
    return null;
  }

  const guild = await client.guilds.fetch(guildId);

  const ticketName = `ticket-${user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      ...(process.env.DISCORD_STAFF_ROLE_ID
        ? [
            {
              id: process.env.DISCORD_STAFF_ROLE_ID,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels,
              ],
            },
          ]
        : []),
    ],
  });

  // Insert ticket into DB (includes discord_guild_id)
  const result = await query(
    `
      INSERT INTO tickets (
        subject,
        status,
        priority,
        discord_user_id,
        discord_channel_id,
        discord_guild_id,
        created_at
      )
      VALUES (?, 'open', 'medium', ?, ?, ?, NOW())
    `,
    [subject, user.id, channel.id, guild.id]
  );

  const ticketId = result.insertId;

  const introEmbed = new EmbedBuilder()
    .setTitle("📩 Support Ticket Opened")
    .setDescription(
      "Please clearly explain your issue and wait for a staff member to respond.\n\n" +
        "🔹 Providing all relevant details will help us resolve your issue faster.\n" +
        "🔹 If your inquiry involves a payment, please include the associated email address used at checkout.\n\n" +
        "⚠️ Please remember: This is a support ticket and should only be used for support-related reasons.\n\n" +
        "Do not ping staff — tickets are answered in the order they are received."
    )
    .setColor(0x22c55e);

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${user.id}>`,
    embeds: [introEmbed],
    components: [closeRow],
  });

  return { ticketId, channel };
}

// Send staff reply (from website) into the ticket channel
async function sendStaffReplyToDiscord(ticketId, staffUsername, messageText) {
  const rows = await query(
    "SELECT id, discord_channel_id FROM tickets WHERE id = ?",
    [ticketId]
  );

  if (!rows.length) {
    throw new Error(`No ticket found in DB with id=${ticketId}`);
  }

  const ticket = rows[0];

  if (!ticket.discord_channel_id) {
    throw new Error(
      `Ticket id=${ticket.id} has no discord_channel_id set in DB`
    );
  }

  const channelId = ticket.discord_channel_id;

  const channel = await client.channels.fetch(channelId).catch((e) => {
    console.error("Error fetching channel from Discord API:", e);
    return null;
  });

  if (!channel) {
    throw new Error(
      `Discord channel not found for id=${channelId} (ticketId=${ticketId})`
    );
  }

  await channel.send(`**${staffUsername} (Staff):** ${messageText}`);
}

// Helper: build & DM transcript from bot when ticket closes via Discord
async function sendTranscriptDMFromBot(ticketId) {
  try {
    // 1) Get ticket + owner + public_token
    const [ticket] = await query(
      "SELECT id, discord_user_id, subject, public_token FROM tickets WHERE id = ?",
      [ticketId]
    );
    if (!ticket || !ticket.discord_user_id) return;

    const discordUserId = ticket.discord_user_id.toString();

    // 2) Ensure public_token exists
    let publicToken = ticket.public_token;
    if (!publicToken) {
      publicToken = crypto.randomBytes(24).toString("hex");
      await query("UPDATE tickets SET public_token = ? WHERE id = ?", [
        publicToken,
        ticketId,
      ]);
    }

    const publicViewUrl = `${FRONTEND_BASE}/view/${publicToken}`;

    // 3) Fetch user
    const user = await client.users.fetch(discordUserId).catch((e) => {
      console.error("Error fetching user for transcript DM (bot-side):", e);
      return null;
    });
    if (!user) return;

    // 4) Fetch messages for transcript
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

    // 5) Build plain-text transcript
    const lines = messages.map((m) => {
      const ts = m.created_at ? new Date(m.created_at).toISOString() : "";
      const name = m.username || "Unknown user";
      return `[${ts}] ${name}: ${m.message}`;
    });

    const transcriptText =
      lines.length > 0 ? lines.join("\n") : "No messages in this ticket.";

    const header =
      `Your support ticket #${ticketId} has been closed.\n` +
      (ticket.subject ? `Subject: ${ticket.subject}\n` : "") +
      `\nYou can view this ticket online here:\n${publicViewUrl}\n\n` +
      `Transcript (may be split across multiple messages):\n`;

    const MAX_LEN = 2000;

    // 6) Send header
    await user.send(header.slice(0, MAX_LEN));

    // 7) Chunk transcript into multiple messages
    let remaining = transcriptText;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, MAX_LEN - 10); // room for ``` ```
      remaining = remaining.slice(MAX_LEN - 10);
      await user.send("```" + chunk + "```");
    }

    // 8) Mark transcript as sent
    await query("UPDATE tickets SET transcript_sent = 1 WHERE id = ?", [
      ticketId,
    ]);
  } catch (err) {
    console.error("sendTranscriptDMFromBot error:", err);
  }
}

// ---------------- DISCORD EVENTS ----------------

client.on("interactionCreate", async (interaction) => {
  // ---------- BUTTONS ----------
  if (interaction.isButton()) {
    // OPEN TICKET BUTTON -> SHOW SUBJECT MODAL
    if (interaction.customId === "open_ticket") {
      try {
        const modal = new ModalBuilder()
          .setCustomId("ticket_subject_modal")
          .setTitle("Open Support Ticket");

        const subjectInput = new TextInputBuilder()
          .setCustomId("ticket_subject")
          .setLabel("Ticket Subject")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. Billing issue, server not working, etc.")
          .setRequired(true)
          .setMaxLength(100);

        const row = new ActionRowBuilder().addComponents(subjectInput);
        modal.addComponents(row);

        // Respond immediately with the modal (no DB calls here)
        await interaction.showModal(modal);
      } catch (err) {
        console.error("interactionCreate open_ticket (showModal) error:", err);

        // At this point we usually can't safely reply to the interaction.
        // Best effort: DM the user so they know to try again.
        try {
          await interaction.user.send(
            "Something went wrong while opening your ticket modal. Please try clicking the button again."
          );
        } catch (dmErr) {
          console.error("Failed to DM user about modal error:", dmErr);
        }
      }
      return;
    }

    // CLOSE TICKET BUTTON
    if (interaction.customId === "close_ticket") {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = interaction.channel;
        if (!channel || channel.type !== ChannelType.GuildText) {
          await interaction.editReply({
            content: "This interaction can only be used in a ticket channel.",
          });
          return;
        }

        const rows = await query(
          "SELECT id, discord_user_id FROM tickets WHERE discord_channel_id = ? LIMIT 1",
          [channel.id]
        );

        if (!rows.length) {
          await interaction.editReply({
            content: "This channel is not linked to a ticket in the system.",
          });
          return;
        }

        const ticket = rows[0];
        const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID;
        const member = interaction.member;

        const isStaff =
          staffRoleId &&
          member &&
          member.roles &&
          member.roles.cache?.has(staffRoleId);

        const isOwner = interaction.user.id === ticket.discord_user_id;

        if (!isStaff && !isOwner) {
          await interaction.editReply({
            content: "Only staff or the ticket owner can close this ticket.",
          });
          return;
        }

        // Update DB: mark as closed
        await query(
          "UPDATE tickets SET status = 'closed', closed_at = NOW() WHERE id = ?",
          [ticket.id]
        );

        // Send transcript DM to ticket owner (bot-side)
        await sendTranscriptDMFromBot(ticket.id);

        await interaction.editReply({
          content:
            "Ticket has been marked as closed and this channel will be deleted.",
        });

        // Optional: send a final message before deletion
        await channel.send(
          "🔒 This ticket has been closed. The channel will now be deleted."
        );

        // Delete the channel
        await channel.delete("Ticket closed via close button");
      } catch (err) {
        console.error("interactionCreate close_ticket error:", err);
        if (interaction.deferred || interaction.replied) {
          try {
            await interaction.editReply({
              content: "Something went wrong while closing this ticket.",
            });
          } catch (editErr) {
            console.error(
              "Failed to edit reply after close_ticket error:",
              editErr
            );
          }
        }
      }
      return;
    }

    return;
  }

  // ---------- MODALS ----------
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ticket_subject_modal") {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const user = interaction.user;
        const subjectRaw =
          interaction.fields.getTextInputValue("ticket_subject") || "";
        const subject = subjectRaw.trim() || "New Ticket";

        // Re-check open ticket in case something changed between button & modal submit
        const existing = await query(
          "SELECT id, discord_channel_id FROM tickets WHERE discord_user_id = ? AND status = 'open' LIMIT 1",
          [user.id]
        );

        if (existing.length > 0) {
          await interaction.editReply({
            content: `You already have an open ticket: <#${existing[0].discord_channel_id}>`,
          });
          return;
        }

        const created = await createTicketForUser(user, subject);

        if (!created) {
          await interaction.editReply({
            content: "Something went wrong creating your ticket.",
          });
          return;
        }

        await interaction.editReply({
          content: `Ticket created: <#${created.channel.id}> (Subject: **${subject}**)`,
        });
      } catch (err) {
        console.error("interactionCreate ticket_subject_modal error:", err);
        if (interaction.deferred || interaction.replied) {
          try {
            await interaction.editReply({
              content: "Something went wrong while creating your ticket.",
            });
          } catch (editErr) {
            console.error(
              "Failed to edit reply after ticket_subject_modal error:",
              editErr
            );
          }
        }
      }
    }
  }
});

// Message logging in ticket channels
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Command to drop the ticket panel once
  if (message.content === "!ticketpanel") {
    const member = message.member;

    if (
      !member ||
      !member.permissions ||
      !member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return;
    }

    await sendTicketPanel(message.channel);
    return;
  }

  // Check if this channel is a ticket channel
  try {
    const rows = await query(
      "SELECT id FROM tickets WHERE discord_channel_id = ?",
      [message.channel.id]
    );
    if (!rows.length) return;

    const ticketId = rows[0].id;

    await query(
      `
        INSERT INTO ticket_messages (ticket_id, discord_user_id, message)
        VALUES (?, ?, ?)
      `,
      [ticketId, message.author.id, message.content]
    );
  } catch (err) {
    console.error("messageCreate ticket logging error:", err);
  }
});

// ---------------- BOT WEBHOOK SERVER (FROM WEBSITE) ----------------

const api = express();
api.use(express.json());

api.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Dashboard -> Bot: send staff reply into Discord
api.post("/staff-reply", async (req, res) => {
  const { ticketId, staffUsername, message } = req.body;

  if (!ticketId || !message) {
    return res
      .status(400)
      .json({ error: "ticketId and message are required" });
  }

  try {
    await sendStaffReplyToDiscord(
      Number(ticketId),
      staffUsername || "Staff",
      message
    );
    res.json({ success: true });
  } catch (err) {
    console.error("/staff-reply error:", err);
    res.status(500).json({
      error: "Failed to send staff reply to Discord",
      details: err.message,
    });
  }
});

// Website -> Bot: send ticket transcript DM to user (website-initiated)
api.post("/ticket-transcript", async (req, res) => {
  const { ticketId, discordUserId, transcript, viewUrl } = req.body;

  if (!ticketId || !discordUserId || !transcript || !viewUrl) {
    return res.status(400).json({
      error: "ticketId, discordUserId, transcript, and viewUrl are required",
    });
  }

  try {
    const user = await client.users
      .fetch(discordUserId.toString())
      .catch((e) => {
        console.error("Error fetching user for transcript DM:", e);
        return null;
      });

    if (!user) {
      console.error(
        `Could not find Discord user ${discordUserId} to DM transcript`
      );
      return res.status(404).json({ error: "Discord user not found" });
    }

    const header =
      `Your support ticket #${ticketId} has been closed.\n\n` +
      `You can view the full conversation online here:\n${viewUrl}\n\n` +
      `Transcript (may be split across multiple messages):\n`;

    const MAX_LEN = 2000;

    await user.send(header.slice(0, MAX_LEN));

    let remaining = transcript;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, MAX_LEN - 10);
      remaining = remaining.slice(MAX_LEN - 10);
      await user.send("```" + chunk + "```");
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("/ticket-transcript error:", err);
    return res.status(500).json({
      error: "Failed to send ticket transcript DM",
      details: err.message,
    });
  }
});

// Dashboard -> Bot: delete the Discord channel for a ticket
api.post("/ticket-delete-channel", async (req, res) => {
  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(400).json({ error: "ticketId required" });
  }

  try {
    // Lookup ticket's channel
    const [ticket] = await query(
      "SELECT discord_channel_id FROM tickets WHERE id = ?",
      [ticketId]
    );

    if (!ticket || !ticket.discord_channel_id) {
      return res
        .status(404)
        .json({ error: "Ticket has no associated Discord channel" });
    }

    const channelId = ticket.discord_channel_id.toString();

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      console.warn(
        `Channel ${channelId} not found when trying to delete for ticket ${ticketId}`
      );
      return res.json({ success: true, warning: "Channel not found" });
    }

    await channel.send(
      "🔒 This ticket has been closed from the dashboard. This channel will now be deleted."
    );

    await channel.delete("Ticket closed via dashboard");

    return res.json({ success: true });
  } catch (err) {
    console.error("Bot /ticket-delete-channel error:", err);
    return res.status(500).json({
      error: "Failed to delete ticket channel",
      details: err.message,
    });
  }
});

const webhookPort = Number(process.env.BOT_WEBHOOK_PORT || 4000);
api.listen(webhookPort, () => {
  console.log(
    `📡 Bot webhook listening on http://0.0.0.0:${webhookPort} (internal)`
  );
});

// ---------------- START DISCORD BOT ----------------

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error("DISCORD_BOT_TOKEN missing in .env");
  process.exit(1);
}

client
  .login(process.env.DISCORD_BOT_TOKEN)
  .catch((err) => {
    console.error("Discord login failed:", err);
    process.exit(1);
  });
