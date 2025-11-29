// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Header from "./Header.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

// Pages
import Dashboard from "./Dashboard.jsx";
import TicketDetail from "./ticketDetail.jsx";
import TicketTranscriptPublic from "./TicketTranscriptPublic.jsx";

import AdminUsers from "./AdminUsers.jsx";
import AdminUpdates from "./AdminUpdates.jsx";

import Onboarding from "./Onboarding.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header />

        <Routes>

          {/* Public transcript */}
          <Route path="/view/:token" element={<TicketTranscriptPublic />} />

          {/* Onboarding & settings (same component) */}
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/settings" element={<Onboarding />} />

          {/* Auth-protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/tickets/:id"
            element={
              <ProtectedRoute>
                <TicketDetail />
              </ProtectedRoute>
            }
          />

          {/* Admin: users */}
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <AdminUsers />
              </ProtectedRoute>
            }
          />

          {/* Admin: updates */}
          <Route
            path="/admin/updates"
            element={
              <ProtectedRoute>
                <AdminUpdates />
              </ProtectedRoute>
            }
          />

          {/* Login failed fallback */}
          <Route
            path="/login-failed"
            element={
              <div className="min-h-screen flex items-center justify-center text-red-400">
                Discord login failed. Please try again.
              </div>
            }
          />

        </Routes>
      </div>
    </BrowserRouter>
  );
}
