"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface LiveAvailabilityProps {
  eventId: string;
  totalTickets: number;
  initialBooked: number;
}

export function LiveAvailability({ eventId, totalTickets, initialBooked }: LiveAvailabilityProps) {
  const [bookedTickets, setBookedTickets] = useState(initialBooked);

  // ── Immediate fetch on mount to get fresh state ──────────────────────────
  // SSE only pushes DELTA updates on new bookings. If the user navigates back
  // to this page after a booking, the SSR HTML is stale-cached and SSE won't
  // fire until the next booking event. Fetching once on mount gets the true
  // current count instantly, regardless of cache.
  useEffect(() => {
    fetch(`${API}/events/${eventId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.bookedTickets === "number") {
          setBookedTickets(data.bookedTickets);
        }
      })
      .catch(() => { /* keep showing initialBooked on error */ });
  }, [eventId]);

  // ── SSE: real-time push updates on new bookings ──────────────────────────
  useEffect(() => {
    const source = new EventSource(`${API}/events/${eventId}/stream`);
    source.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as { bookedTickets: number };
        if (typeof data.bookedTickets === "number") {
          setBookedTickets(data.bookedTickets);
        }
      } catch { /* ignore */ }
    };
    return () => source.close();
  }, [eventId]);

  const available = totalTickets - bookedTickets;
  const soldPct = Math.round((bookedTickets / totalTickets) * 100);

  return (
    <div style={{ marginBottom: "1rem" }}>
      {/* Text row */}
      <div className="detail-meta-item" style={{ marginBottom: "0.6rem" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span>
          <span
            style={{
              color: available === 0
                ? "var(--danger)"
                : available < totalTickets * 0.2
                ? "var(--warning)"
                : "inherit",
              fontWeight: available === 0 ? 600 : undefined,
            }}
          >
            {available.toLocaleString()}
          </span>
          {" "}of {totalTickets.toLocaleString()} tickets available
          {available === 0 && (
            <span
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--danger)",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                padding: "0.1rem 0.45rem",
                borderRadius: "999px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              SOLD OUT
            </span>
          )}
        </span>
      </div>

      {/* Availability bar */}
      <div className="availability-bar" style={{ width: "100%", height: "8px" }}>
        <div
          className={`availability-fill ${soldPct > 80 ? "fill-red" : soldPct > 50 ? "fill-yellow" : "fill-green"}`}
          style={{ width: `${soldPct}%`, transition: "width 0.6s ease" }}
        />
      </div>
      <p className="text-muted mt-1" style={{ fontSize: "0.8rem" }}>
        {soldPct}% sold
      </p>
    </div>
  );
}
