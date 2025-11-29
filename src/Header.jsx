// src/Header.jsx
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
export default function Header() {
  const [user, setUser] = useState(null);
  const [siteName, setSiteName] = useState("TLogi");
  const location = useLocation();

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  // Load user + settings
  useEffect(() => {
    const load = async () => {
      try {
        const userRes = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });

        if (userRes.ok) {
          setUser(await userRes.json());
        }

        const settingsRes = await fetch(`${API_BASE}/settings`, {
          credentials: "include",
        });

        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.site_name) setSiteName(settings.site_name);
        }
      } catch (err) {
        console.error("Header load error:", err);
      }
    };

    load();
  }, [location.pathname]);

  const handleLogin = () => {
    window.location.href = `${API_BASE}/auth/discord`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error(err);
    } finally {
      window.location.href = "/";
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        
        {/* LEFT SIDE: Logo + Nav */}
        <div className="flex items-center gap-8">
          {/* Logo + Site Name */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 text-lg font-semibold">
              T
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-100">
                {siteName}
              </span>
              <span className="text-xs text-slate-400">
                Discord Ticket Dashboard
              </span>
            </div>
          </div>

          {/* NAVIGATION LEFT */}
          {user?.hasAccess && (
            <nav className="flex items-center gap-2 text-xs">

              {/* Dashboard */}
              <Link
                to="/"
                className={`rounded-lg px-3 py-1.5 transition ${
                  isActive("/")
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                }`}
              >
                Dashboard
              </Link>

              {/* SUPER ADMIN NAV */}
              {user?.is_super_admin && (
                <>
                  <Link
                    to="/admin/users"
                    className={`rounded-lg px-3 py-1.5 transition ${
                      isActive("/admin/users")
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    User Management
                  </Link>

                  <Link
                    to="/settings"
                    className={`rounded-lg px-3 py-1.5 transition ${
                      isActive("/settings") || isActive("/onboarding")
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    Settings
                  </Link>

                  <Link
                    to="/admin/updates"
                    className={`rounded-lg px-3 py-1.5 transition ${
                      isActive("/admin/updates")
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    Updates
                  </Link>
                </>
              )}

            </nav>
          )}
        </div>

        {/* RIGHT SIDE: User Panel */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-100">
                  {user.username}
                </span>
                <span className="text-[10px] text-slate-400">
                  {user.is_super_admin
                    ? "Super Admin"
                    : user.is_staff
                    ? "Staff"
                    : "User"}
                </span>
              </div>

              <div className="h-8 w-8 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center text-xs">
                {user.avatar ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
                    alt="avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-slate-200">
                    {user.username?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800 transition"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={handleLogin}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition"
            >
              Login with Discord
            </button>
          )}
        </div>

      </div>
    </header>
  );
}