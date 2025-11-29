// src/Onboarding.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
export default function Onboarding() {
  const navigate = useNavigate();

  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [siteName, setSiteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingSettings(true);
        const res = await fetch(`${API_BASE}/settings`, {
          credentials: "include",
        });
        const data = await res.json();
        setSettings(data);
        if (data.site_name) {
          setSiteName(data.site_name);
        }
      } catch (err) {
        console.error("GET /settings error:", err);
      } finally {
        setLoadingSettings(false);
      }
    };

    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!siteName.trim()) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`${API_BASE}/settings/site-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ siteName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save site name");
      }

      await res.json();
      navigate("/");
    } catch (err) {
      console.error("POST /settings/site-name error:", err);
      setError(err.message || "Failed to save site name");
    } finally {
      setSaving(false);
    }
  };

  if (loadingSettings) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading…</div>
      </div>
    );
  }

  const needsOnboarding = settings?.needsOnboarding;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 px-7 py-6 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          {needsOnboarding ? "Welcome to TLogi" : "Update Website Name"}
        </h1>
        <p className="text-sm text-slate-400 mb-5">
          {needsOnboarding
            ? "Let’s set a display name for your support dashboard."
            : "Change the name used for your dashboard header."}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">
              Website Name (e.g. &quot;Hostvera Support&quot;)
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              maxLength={100}
            />
          </div>

          <button
            type="submit"
            disabled={saving || !siteName.trim()}
            className="w-full inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </form>

        <p className="mt-4 text-[11px] text-slate-500">
          The first person to complete onboarding becomes a Super Admin.
        </p>
      </div>
    </div>
  );
}