// src/AdminUsers.jsx
import { useEffect, useState } from "react";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
function levelFromRow(row) {
  if (row.is_super_admin) return "super_admin";
  if (row.role) return "staff";
  return "none";
}

export default function AdminUsers() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingFor, setSavingFor] = useState(null);

  // Load current user
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });

        if (!res.ok) {
          setCurrentUser(null);
          return;
        }

        const data = await res.json();
        setCurrentUser(data);
      } catch (err) {
        console.error("auth/me error:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    load();
  }, []);

  // Load users if super admin
  useEffect(() => {
    if (!currentUser?.is_super_admin) return;

    const loadUsers = async () => {
      try {
        setUsersLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/admin/users`, {
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load users");
        }

        const rows = await res.json();
        const withLevel = rows.map((u) => ({
          ...u,
          level: levelFromRow(u),
        }));
        setUsers(withLevel);
      } catch (err) {
        console.error("GET /admin/users error:", err);
        setError(err.message || "Failed to load users");
      } finally {
        setUsersLoading(false);
      }
    };

    loadUsers();
  }, [currentUser]);

  const handleChangeLevel = async (discordId, newLevel) => {
    try {
      setSavingFor(discordId);
      setError(null);

      const res = await fetch(
        `${API_BASE}/admin/users/${encodeURIComponent(discordId)}/role`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ level: newLevel }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update role");
      }

      const data = await res.json();

      setUsers((prev) =>
        prev.map((u) =>
          u.discordId === discordId ? { ...u, level: data.level } : u
        )
      );
    } catch (err) {
      console.error("update role error:", err);
      setError(err.message || "Failed to update role");
    } finally {
      setSavingFor(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Checking access…</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-300">
          You are not logged in. Use the Discord login button at the top.
        </p>
      </div>
    );
  }

  if (!currentUser.is_super_admin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-red-500/40 bg-slate-900/80 px-6 py-5 shadow-xl text-center">
          <h1 className="text-xl font-semibold text-red-400 mb-2">
            Super admin access required
          </h1>
          <p className="text-sm text-slate-300">
            Only super admins can manage staff members.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            User Management
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Promote Discord users to Staff or Super Admin.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Discord ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Level
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {usersLoading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-sm text-slate-400"
                    >
                      Loading users…
                    </td>
                  </tr>
                )}

                {!usersLoading && users.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-sm text-slate-400"
                    >
                      No users have logged in yet.
                    </td>
                  </tr>
                )}

                {!usersLoading &&
                  users.map((u) => (
                    <tr key={u.discordId} className="hover:bg-slate-800/70">
                      <td className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center text-xs">
                          {u.avatar ? (
                            <img
                              src={`https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png`}
                              alt={u.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-slate-200">
                              {u.username?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-100">
                            {u.username || "Unknown user"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {u.discordId}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                          value={u.level}
                          disabled={savingFor === u.discordId}
                          onChange={(e) =>
                            handleChangeLevel(u.discordId, e.target.value)
                          }
                        >
                          <option value="none">No Access</option>
                          <option value="staff">Staff Member</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Note: Super Admins can access everything, including user management.
        </p>
      </div>
    </div>
  );
}