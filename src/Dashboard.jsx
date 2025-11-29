// src/Dashboard.jsx
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";

const useDomain =
  import.meta.env.VITE_USE_DOMAIN === "true" ||
  import.meta.env.VITE_USE_DOMAIN === undefined;

const API_BASE = useDomain
  ? import.meta.env.VITE_API_DOMAIN
  : `http://${import.meta.env.VITE_HOST || window.location.hostname}:${
      import.meta.env.VITE_WEBHOOK_PORT
    }`;
    
function Dashboard() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    open_tickets: 0,
    closed_tickets: 0,
    total_tickets: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters / search
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Sorting
  const [sortConfig, setSortConfig] = useState({
    key: "created_at",
    direction: "desc",
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [ticketsRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/tickets`, { credentials: "include" }),
          fetch(`${API_BASE}/tickets/stats`, { credentials: "include" }),
        ]);

        if (!ticketsRes.ok) throw new Error("Failed to load tickets");
        if (!statsRes.ok) throw new Error("Failed to load stats");

        const ticketsData = await ticketsRes.json();
        const statsData = await statsRes.json();

        setTickets(ticketsData || []);
        setStats(statsData || {});
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err.message || "An error occurred while loading tickets.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter + search
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;

      if (search.trim() !== "") {
        const s = search.toLowerCase();
        const subject = t.subject ? t.subject.toLowerCase() : "";
        const idStr = t.id != null ? String(t.id).toLowerCase() : "";
        const channelStr =
          t.channel_id != null ? String(t.channel_id).toLowerCase() : "";

        return (
          subject.includes(s) ||
          idStr.includes(s) ||
          channelStr.includes(s)
        );
      }

      return true;
    });
  }, [tickets, statusFilter, priorityFilter, search]);

  // Sort
  const sortedTickets = useMemo(() => {
    const sorted = [...filteredTickets];
    sorted.sort((a, b) => {
      const { key, direction } = sortConfig;

      let valA = a[key];
      let valB = b[key];

      if (key === "created_at") {
        valA = valA ? new Date(valA) : new Date(0);
        valB = valB ? new Date(valB) : new Date(0);
      } else {
        // Normalize for string-like compare
        valA = valA ?? "";
        valB = valB ?? "";
      }

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredTickets, sortConfig]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / pageSize));

  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTickets.slice(start, start + pageSize);
  }, [sortedTickets, currentPage]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
  };

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Support Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              High-level overview of ticket activity
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-400">
                Open Tickets
              </p>
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 ring-1 ring-amber-500/30">
                Live
              </span>
            </div>
            <p className="text-4xl font-bold text-amber-400">
              {stats.open_tickets ?? 0}
            </p>
            <p className="text-xs text-slate-500">
              {stats.open_tickets
                ? "Tickets currently awaiting resolution."
                : "No open tickets at the moment."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-400">
                Closed Tickets
              </p>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
                Resolved
              </span>
            </div>
            <p className="text-4xl font-bold text-emerald-400">
              {stats.closed_tickets ?? 0}
            </p>
            <p className="text-xs text-slate-500">
              Tickets successfully closed.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-400">
                Total Tickets
              </p>
              <span className="inline-flex items-center rounded-full bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400 ring-1 ring-sky-500/30">
                All Time
              </span>
            </div>
            <p className="text-4xl font-bold text-sky-400">
              {stats.total_tickets ?? 0}
            </p>
            <p className="text-xs text-slate-500">
              Sum of all created tickets.
            </p>
          </div>
        </div>

        {/* Tickets Table Section Header + Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Tickets</h2>
            <p className="text-sm text-slate-400">
              Overview of your most recent support tickets
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              type="text"
              placeholder="Search by subject or ID..."
              className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />

            {/* <select
              className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>

            <select
              className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select> */}
          </div>
        </div>

        {/* Table Card */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer select-none"
                    onClick={() => handleSort("id")}
                  >
                    Ticket ID{sortIndicator("id")}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer select-none"
                    onClick={() => handleSort("subject")}
                  >
                    Subject{sortIndicator("subject")}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer select-none"
                    onClick={() => handleSort("status")}
                  >
                    Status{sortIndicator("status")}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer select-none"
                    onClick={() => handleSort("priority")}
                  >
                    Priority{sortIndicator("priority")}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer select-none"
                    onClick={() => handleSort("created_at")}
                  >
                    Created At{sortIndicator("created_at")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {/* Loading skeleton */}
                {loading &&
                  !error &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3">
                        <div className="h-3 w-16 rounded bg-slate-800" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-40 rounded bg-slate-800" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-20 rounded bg-slate-800" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-20 rounded bg-slate-800" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-28 rounded bg-slate-800" />
                      </td>
                    </tr>
                  ))}

                {/* Error state */}
                {!loading && error && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-red-400"
                    >
                      {error}
                    </td>
                  </tr>
                )}

                {/* Empty state */}
                {!loading &&
                  !error &&
                  paginatedTickets.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-sm text-slate-400"
                      >
                        No tickets found. Try adjusting filters or search.
                      </td>
                    </tr>
                  )}

                {/* Real rows */}
                {!loading &&
                  !error &&
                  paginatedTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="hover:bg-slate-800/70 transition"
                    >
                      <td className="px-4 py-3 align-middle text-slate-200">
                        <Link
                          to={`/tickets/${ticket.id}`}
                          className="text-sky-400 hover:underline"
                        >
                          #{ticket.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-middle text-slate-100">
                        {ticket.subject || "(no subject)"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`
                            inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1
                            ${
                              ticket.status === "open"
                                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
                                : ticket.status === "pending"
                                ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
                                : "bg-slate-500/10 text-slate-300 ring-slate-500/30"
                            }
                          `}
                        >
                          {ticket.status || "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`
                            inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1
                            ${
                              ticket.priority === "high"
                                ? "bg-red-500/10 text-red-400 ring-red-500/30"
                                : ticket.priority === "medium"
                                ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
                                : "bg-sky-500/10 text-sky-400 ring-sky-500/30"
                            }
                          `}
                        >
                          {ticket.priority || "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-slate-400 text-sm">
                        {ticket.created_at
                          ? new Date(ticket.created_at).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!loading && !error && (
          <div className="flex items-center justify-between text-sm text-slate-400">
            <p>
              Page {currentPage} of {totalPages} · {sortedTickets.length} result
              {sortedTickets.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <button
                className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;