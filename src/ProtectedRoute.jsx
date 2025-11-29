// src/ProtectedRoute.jsx
import { useEffect, useState } from "react";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
function NoAccessScreen({ needsOnboarding }) {
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error(e);
    } finally {
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-red-500/40 bg-slate-900/80 px-6 py-5 shadow-xl text-center space-y-3">
        <h1 className="text-xl font-semibold text-red-400">
          You don't have access
        </h1>
        <p className="text-sm text-slate-300">
          Your Discord account is not configured as staff for this dashboard.
        </p>
        {needsOnboarding && (
          <p className="text-xs text-slate-400">
            If you are the owner and this is your first time setting up TLogi,
            complete onboarding from the <span className="font-semibold">Settings</span>{" "}
            page once a super admin is configured.
          </p>
        )}
        <button
          onClick={handleLogout}
          className="mt-2 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800 transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

function LoginRequiredScreen() {
  const handleLogin = () => {
    window.location.href = `${API_BASE}/auth/discord`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-5 shadow-xl text-center space-y-3">
        <h1 className="text-xl font-semibold text-slate-100">
          Login required
        </h1>
        <p className="text-sm text-slate-300">
          Please sign in with Discord to access the dashboard.
        </p>
        <button
          onClick={handleLogin}
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition"
        >
          Login with Discord
        </button>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const [state, setState] = useState({
    loading: true,
    user: null,
    needsOnboarding: false,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // 1) Check auth
        const userRes = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });

        if (!userRes.ok) {
          // NOT AUTHENTICATED → show login screen, do NOT redirect
          if (!cancelled) {
            setState({
              loading: false,
              user: null,
              needsOnboarding: false,
            });
          }
          return;
        }

        const user = await userRes.json();

        // 2) Load settings for onboarding
        let needsOnboarding = false;
        try {
          const settingsRes = await fetch(`${API_BASE}/settings`, {
            credentials: "include",
          });
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            needsOnboarding = !!settings.needsOnboarding;
          }
        } catch (err) {
          console.error("ProtectedRoute /settings error:", err);
        }

        // 3) Force onboarding if needed (only once; onboarding route itself is not protected)
        if (
          needsOnboarding &&
          window.location.pathname !== "/onboarding"
        ) {
          if (!cancelled) {
            window.location.href = "/onboarding";
          }
          return;
        }

        if (!cancelled) {
          setState({
            loading: false,
            user,
            needsOnboarding,
          });
        }
      } catch (err) {
        console.error("ProtectedRoute error:", err);
        if (!cancelled) {
          setState({
            loading: false,
            user: null,
            needsOnboarding: false,
          });
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 text-sm">
          Loading dashboard…
        </div>
      </div>
    );
  }

  // Not logged in: show login CTA instead of redirect loop
  if (!state.user) {
    return <LoginRequiredScreen />;
  }

  // Logged in but not staff/super admin
  if (!state.user.hasAccess) {
    return <NoAccessScreen needsOnboarding={state.needsOnboarding} />;
  }

  // All good
  return children;
}
