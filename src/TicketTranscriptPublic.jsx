import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
export default function TicketTranscriptPublic() {
  const { token } = useParams();

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/public/tickets/${token}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Ticket not found or link is invalid.");
          }
          throw new Error("Failed to load ticket transcript.");
        }

        const data = await res.json();
        setTicket(data.ticket);
        setMessages(data.messages || []);
      } catch (err) {
        console.error(err);
        setError(err.message || "An error occurred.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">
          Loading transcript…
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-4">
        <p className="text-red-400 mb-4 text-center">{error || "Ticket not found."}</p>
        <Link
          to="/"
          className="text-sm text-sky-400 hover:text-sky-300 underline"
        >
          Go back to TLogi
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ticket Transcript #{ticket.id}
          </h1>
          <p className="text-sm text-slate-400">
            {ticket.subject || "No subject provided"}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            <span
              className={`
                inline-flex items-center rounded-full px-3 py-1 font-semibold
                ${
                  ticket.status === "closed"
                    ? "bg-slate-500/10 text-slate-300 border border-slate-500/40"
                    : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                }
              `}
            >
              {ticket.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Created:{" "}
            {ticket.created_at
              ? new Date(ticket.created_at).toLocaleString()
              : "-"}
            {ticket.closed_at && (
              <>
                {" · "}Closed:{" "}
                {new Date(ticket.closed_at).toLocaleString()}
              </>
            )}
          </p>
        </div>

        {/* Conversation */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 min-h-[300px]">
          <h2 className="text-sm font-semibold text-slate-100 mb-3">
            Conversation
          </h2>

          {messages.length === 0 ? (
            <p className="text-xs text-slate-500">
              There are no messages in this ticket.
            </p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-100">
                      {msg.username || "Unknown user"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {msg.created_at
                        ? new Date(msg.created_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <p className="text-slate-200 whitespace-pre-wrap">
                    {msg.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-center text-[11px] text-slate-500">
          This link is unique to your ticket. Keep it private if you don&apos;t want
          others to see this conversation.
        </div>
      </div>
    </div>
  );
}