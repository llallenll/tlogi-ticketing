// src/TicketDetail.jsx
import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [savingReply, setSavingReply] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [closing, setClosing] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [priorityValue, setPriorityValue] = useState("low");

  const [error, setError] = useState(null);

  // current user (for is_super_admin)
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);

  const isClosed = ticket?.status === "closed";

  // ref for auto-scrolling the conversation
  const messagesEndRef = useRef(null);

  const loadTicket = async () => {
    try {
      setLoading(true);
      const [ticketRes, messagesRes] = await Promise.all([
        fetch(`${API_BASE}/tickets/${id}`, { credentials: "include" }),
        fetch(`${API_BASE}/tickets/${id}/messages`, {
          credentials: "include",
        }),
      ]);

      if (!ticketRes.ok) throw new Error("Failed to load ticket");
      if (!messagesRes.ok) throw new Error("Failed to load messages");

      const ticketData = await ticketRes.json();
      const messagesData = await messagesRes.json();

      setTicket(ticketData);
      setMessages(messagesData);
      setPriorityValue(ticketData?.priority || "low");
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load current user (for is_super_admin flag)
  useEffect(() => {
    const fetchUser = async () => {
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
        setUserLoading(false);
      }
    };

    fetchUser();
  }, []);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleReplySubmit = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      setSavingReply(true);

      const res = await fetch(`${API_BASE}/tickets/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: replyText }),
      });

      if (!res.ok) {
        throw new Error("Failed to send reply");
      }

      const newMessage = await res.json();
      setMessages((prev) => [...prev, newMessage]);
      setReplyText("");
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to send reply");
    } finally {
      setSavingReply(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!window.confirm("Are you sure you want to close this ticket?")) return;

    try {
      setClosing(true);
      setError(null);

      const res = await fetch(`${API_BASE}/tickets/${id}/close`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to close ticket");

      // Reload the ticket so status/closed_at updates in the UI
      await loadTicket();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to close ticket");
    } finally {
      setClosing(false);
    }
  };

  const handlePriorityUpdate = async () => {
    if (!priorityValue) return;

    try {
      setSavingPriority(true);
      setError(null);

      const res = await fetch(`${API_BASE}/tickets/${id}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priority: priorityValue }),
      });

      if (!res.ok) throw new Error("Failed to update priority");

      setTicket((prev) =>
        prev ? { ...prev, priority: priorityValue } : prev
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to update priority");
    } finally {
      setSavingPriority(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!currentUser?.is_super_admin) return;

    if (!window.confirm(`Delete ticket #${id}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${API_BASE}/tickets/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete ticket.");
        return;
      }

      navigate("/"); // back to dashboard
    } catch (err) {
      console.error("Delete ticket error:", err);
      alert("Unexpected error deleting ticket.");
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!currentUser?.is_super_admin) return;

    if (!window.confirm("Delete this message?")) return;

    try {
      const res = await fetch(
        `${API_BASE}/tickets/${id}/messages/${messageId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete message.");
        return;
      }

      // remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error("Delete message error:", err);
      alert("Unexpected error deleting message.");
    }
  };

  if (loading) {
    return (
      <div className="h-screen overflow-hidden bg-slate-950 text-slate-100 px-4 py-6">
        <div className="mx-auto max-w-5xl space-y-6 overflow-y-auto h-full pb-20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-4 w-32 rounded bg-slate-800 animate-pulse" />
              <div className="h-6 w-56 rounded bg-slate-800 animate-pulse" />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <div className="h-4 w-40 rounded bg-slate-800 animate-pulse" />
              <div className="h-4 w-24 rounded bg-slate-800 animate-pulse" />
              <div className="h-4 w-32 rounded bg-slate-800 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-12 rounded-lg bg-slate-800/70 animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!ticket) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header / Breadcrumb */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              onClick={() => navigate(-1)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">
              Ticket #{ticket.id}
            </h1>
            <p className="text-sm text-slate-400">
              {ticket.subject || "No subject provided"}
            </p>
          </div>
        </div>

        {/* Optional global error line */}
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)]">
          {/* Left: Ticket meta + actions */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Discord User ID</span>
                <span className="text-slate-100">
                  {ticket.discord_user_id || "Unknown"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Channel ID</span>
                <span className="text-slate-100">
                  {ticket.discord_channel_id || "Unknown"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Created</span>
                <span className="text-slate-100">
                  {ticket.created_at
                    ? new Date(ticket.created_at).toLocaleString()
                    : "-"}
                </span>
              </div>

              <div className="flex items-start gap-2">
                {ticket.closed_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Closed</span>
                    <span className="text-slate-100">
                      {new Date(ticket.closed_at).toLocaleString()}
                    </span>
                  </div>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                    ticket.status === "open"
                      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                      : "bg-slate-500/10 text-slate-300 border border-slate-500/40"
                  }`}
                >
                  {ticket.status}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                    ticket.priority === "high"
                      ? "bg-red-500/10 text-red-300 border border-red-500/40"
                      : ticket.priority === "medium"
                      ? "bg-amber-500/10 text-amber-300 border border-amber-500/40"
                      : "bg-slate-500/10 text-slate-300 border border-slate-500/40"
                  }`}
                >
                  {ticket.priority || "unknown priority"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4 text-sm">
              <h2 className="text-sm font-semibold text-slate-100">Actions</h2>

              {/* Priority control */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">
                  Priority
                </label>
                <div className="flex gap-2">
                  <select
                    className="
                      flex-1 appearance-none rounded-lg border border-slate-700 bg-slate-900/80 
                      px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/60
                      bg-[url('data:image/svg+xml;utf8,<svg fill=%27%23a3aed0%27 height=%2718%27 viewBox=%270 0 24 24%27 width=%2718%27 xmlns=%27http://www.w3.org/2000/svg%27><path d=%27M7 10l5 5 5-5z%27/></svg>')]
                      bg-no-repeat bg-[right_0.6rem_center] pr-8
                    "
                    value={priorityValue}
                    onChange={(e) => setPriorityValue(e.target.value)}
                    disabled={savingPriority}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <button
                    type="button"
                    onClick={handlePriorityUpdate}
                    disabled={savingPriority}
                    className="inline-flex items-center rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {savingPriority ? "Saving..." : "Update"}
                  </button>
                  {currentUser?.is_super_admin && (
                    <button
                      onClick={handleDeleteTicket}
                      className="ml-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                    >
                      Delete Ticket
                    </button>
                  )}
                </div>
              </div>

              {/* Close ticket */}
              <button
                onClick={handleCloseTicket}
                disabled={isClosed || closing}
                className="w-full inline-flex items-center justify-center rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {isClosed ? "Ticket Closed" : closing ? "Closing..." : "Close Ticket"}
              </button>
            </div>
          </div>

          {/* Right: Conversation */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col h-[500px]">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">
              Conversation
            </h2>

            {/* Scrollable conversation area */}
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 mb-4">
              {messages.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No messages yet. Once the user or staff reply, they will
                  appear here.
                </p>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-100">
                          {msg.username || "Unknown user"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {msg.created_at
                              ? new Date(msg.created_at).toLocaleString()
                              : ""}
                          </span>
                          {currentUser?.is_super_admin && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="text-[10px] text-red-400 hover:text-red-300"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {msg.message}
                      </p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Reply box */}
            <form
              onSubmit={handleReplySubmit}
              className="border-t border-slate-800 pt-3 space-y-2"
            >
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder={
                  isClosed
                    ? "This ticket is closed. You can no longer reply."
                    : "Type your reply to the user here…"
                }
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={savingReply || isClosed}
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500">
                  Replies will be synced with the ticket thread.
                </p>
                <button
                  type="submit"
                  disabled={savingReply || isClosed || !replyText.trim()}
                  className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {savingReply ? "Sending..." : "Send reply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TicketDetail;