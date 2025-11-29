// src/AdminUpdates.jsx
import { useEffect, useState } from "react";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
export default function AdminUpdates() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [data, setData] = useState(null);
  const [updatesLoading, setUpdatesLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load current user
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });

        if (!res.ok) {
          setCurrentUser(null);
          return;
        }

        const user = await res.json();
        setCurrentUser(user);
      } catch (err) {
        console.error("AdminUpdates /auth/me error:", err);
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    loadUser();
  }, []);

  // Load update info if super admin
  useEffect(() => {
    if (!currentUser?.is_super_admin) return;

    const loadUpdates = async () => {
      try {
        setUpdatesLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/admin/updates`, {
          credentials: "include",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load update info");
        }

        const info = await res.json();
        setData(info);
      } catch (err) {
        console.error("GET /admin/updates error:", err);
        setError(err.message || "Failed to load update info");
      } finally {
        setUpdatesLoading(false);
      }
    };

    loadUpdates();
  }, [currentUser]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 text-sm">
          Checking access…
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <p className="text-slate-300 text-sm">
          You are not logged in. Use the Discord login button at the top.
        </p>
      </div>
    );
  }

  if (!currentUser.is_super_admin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-red-500/40 bg-slate-900/80 px-6 py-5 shadow-xl text-center space-y-2">
          <h1 className="text-xl font-semibold text-red-400">
            Super admin access required
          </h1>
          <p className="text-sm text-slate-300">
            Only super admins can view and manage panel updates.
          </p>
        </div>
      </div>
    );
  }

  const statusBadge =
    data && (
      <span
        className={
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium " +
          (data.upToDate
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/40"
            : "bg-amber-500/10 text-amber-400 border border-amber-500/40")
        }
      >
        {data.upToDate ? "Up to date" : "Update available"}
      </span>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Updates & Changelog
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Check if your TLogi panel is up to date and review recent changes.
            </p>
          </div>
          {statusBadge}
        </div>

        {/* Version card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {updatesLoading || !data ? (
            <div className="text-sm text-slate-400">Checking for updates…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Version status
                  </p>
                  <p className="text-sm text-slate-100">
                    Current version:{" "}
                    <span className="font-semibold">
                      v{data.currentVersion}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Latest available:{" "}
                    <span className="font-medium text-slate-100">
                      v{data.latestVersion}
                    </span>
                  </p>
                </div>

                <div className="text-right text-xs text-slate-400">
                  {!data.upToDate ? (
                    <p>
                      An update is available. Follow your deploy process to pull
                      the latest version.
                    </p>
                  ) : (
                    <p>Your panel is running the latest version.</p>
                  )}
                  {data.feedError && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      ⚠ {data.feedError}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Changelog */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Changelog
            </h2>
            <span className="text-[11px] text-slate-500">
              {data?.changelog?.length || 0} version
              {data?.changelog?.length === 1 ? "" : "s"}
            </span>
          </div>

          {updatesLoading || !data ? (
            <p className="text-sm text-slate-400">Loading changelog…</p>
          ) : data.changelog.length === 0 ? (
            <p className="text-sm text-slate-400">
              No changelog entries are available from the update server.
            </p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {data.changelog.map((entry, idx) => {
                const lines =
                  entry.changes ||
                  entry.notes ||
                  (typeof entry.description === "string"
                    ? [entry.description]
                    : []);

                return (
                  <div
                    key={`${entry.version}-${idx}`}
                    className="rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">
                          v{entry.version || "?"}
                        </span>
                      </div>
                      {entry.date && (
                        <span className="text-[11px] text-slate-500">
                          {entry.date}
                        </span>
                      )}
                    </div>
                    {lines && lines.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-slate-300 list-disc list-inside">
                        {lines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-500">
          Update checking is read-only. Applying updates still uses your normal
          deploy process (Git pull, container rebuild, etc.).
        </p>
      </div>
    </div>
  );
}