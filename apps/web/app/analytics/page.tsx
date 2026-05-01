"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Summary {
  totalEvents: number;
  activeEvents: number;
  totalBookings: number;
  totalRevenue: number;
}

interface EventOption {
  id: string;
  name: string;
  date: string;
  status: string;
}

interface EventAnalytics {
  eventId: string;
  eventName: string;
  totalSold: number;
  revenue: number;
  avgPrice: number;
  remaining: number;
  totalTickets: number;
  bookedTickets: number;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        padding: "1.5rem",
        borderRadius: "12px",
        background: "var(--surface-card)",
        border: "1px solid var(--border-color)",
      }}
    >
      <span className="text-secondary" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: "2rem", fontWeight: 700, color: accent ?? "var(--accent-primary)", lineHeight: 1 }}>
        {value}
      </span>
      {sub && <span className="text-secondary" style={{ fontSize: "0.8rem" }}>{sub}</span>}
    </div>
  );
}

function CapacityBar({ booked, total }: { booked: number; total: number }) {
  const pct = total > 0 ? Math.round((booked / total) * 100) : 0;
  const color =
    pct >= 90 ? "var(--accent-danger, #ef4444)" :
    pct >= 60 ? "var(--accent-warning, #f59e0b)" :
    "var(--accent-success, #22c55e)";
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.35rem" }}>
        <span className="text-secondary">{booked} sold of {total}</span>
        <span style={{ color, fontWeight: 600 }}>{pct}% sold</span>
      </div>
      <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-color)" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: "3px", background: color, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState(false);

  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [selectedId, setSelectedId] = useState("");
  const [eventData, setEventData] = useState<EventAnalytics | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // Load summary + event list on mount
  useEffect(() => {
    fetch(`${API}/analytics/summary`)
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => setSummaryError(true));

    fetch(`${API}/events`)
      .then((r) => r.json())
      .then((data: EventOption[]) => setEvents(data))
      .catch(() => {/* silently fail — events list is best-effort */})
      .finally(() => setEventsLoading(false));
  }, []);

  // Auto-fetch analytics whenever the selected event changes
  useEffect(() => {
    if (!selectedId) { setEventData(null); setEventError(null); return; }
    setEventError(null);
    setEventData(null);
    setEventLoading(true);
    fetch(`${API}/analytics/events/${selectedId}`)
      .then(async (res) => {
        if (res.status === 404) { setEventError("Event not found"); return; }
        if (!res.ok) { setEventError("Failed to fetch event analytics"); return; }
        setEventData(await res.json());
      })
      .catch(() => setEventError("Network error — is the API running?"))
      .finally(() => setEventLoading(false));
  }, [selectedId]);

  return (
    <div className="container">
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ padding: "3rem 0 2rem" }}>
        <h1 className="section-title" style={{ marginBottom: "0.5rem" }}>Analytics</h1>
        <p className="text-secondary">Platform-wide metrics and per-event breakdowns.</p>
      </div>

      {/* ── System summary ──────────────────────────────────── */}
      <section className="section">
        <h2 className="subsection-title" style={{ marginBottom: "1.25rem" }}>System summary</h2>

        {summaryError && (
          <div className="alert alert-error">Could not load summary — is the API running?</div>
        )}
        {!summary && !summaryError && <p className="text-secondary">Loading…</p>}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
            <StatCard label="Total events" value={String(summary.totalEvents)} />
            <StatCard label="Active events" value={String(summary.activeEvents)} accent="var(--accent-success, #22c55e)" />
            <StatCard label="Confirmed bookings" value={String(summary.totalBookings)} />
            <StatCard label="Total revenue" value={formatPrice(summary.totalRevenue)} accent="var(--accent-warning, #f59e0b)" />
          </div>
        )}
      </section>

      {/* ── Per-event drill-down ─────────────────────────────── */}
      <section className="section">
        <h2 className="subsection-title" style={{ marginBottom: "0.5rem" }}>Event drill-down</h2>
        <p className="text-secondary" style={{ marginBottom: "1.25rem" }}>
          Select an event to see its metrics.
        </p>

        <div style={{ maxWidth: "520px" }}>
          <select
            id="analytics-event-select"
            className="form-input"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={eventsLoading}
            style={{ width: "100%", cursor: "pointer" }}
          >
            <option value="">
              {eventsLoading ? "Loading events…" : events.length === 0 ? "No events found" : "— Select an event —"}
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} · {formatDate(ev.date)}{ev.status === "SOLD_OUT" ? " · SOLD OUT" : ""}
              </option>
            ))}
          </select>
        </div>

        {eventLoading && (
          <p className="text-secondary" style={{ marginTop: "1rem" }}>Loading…</p>
        )}

        {eventError && (
          <div className="alert alert-error" style={{ marginTop: "1rem", maxWidth: "520px" }}>
            {eventError}
          </div>
        )}

        {eventData && (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.5rem",
              borderRadius: "12px",
              background: "var(--surface-card)",
              border: "1px solid var(--border-color)",
              maxWidth: "520px",
            }}
          >
            <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.1rem", fontWeight: 600 }}>
              {eventData.eventName}
            </h3>
            <p className="text-secondary" style={{ fontSize: "0.75rem", fontFamily: "monospace", marginBottom: "1.25rem" }}>
              {eventData.eventId}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <StatCard label="Tickets sold" value={String(eventData.totalSold)} />
              <StatCard label="Revenue" value={formatPrice(eventData.revenue)} accent="var(--accent-warning, #f59e0b)" />
              <StatCard label="Avg price paid" value={formatPrice(eventData.avgPrice)} />
              <StatCard
                label="Remaining"
                value={String(eventData.remaining)}
                sub={`of ${eventData.totalTickets} total`}
                accent={eventData.remaining === 0 ? "var(--accent-danger, #ef4444)" : "var(--accent-success, #22c55e)"}
              />
            </div>

            <CapacityBar booked={eventData.bookedTickets} total={eventData.totalTickets} />

            <div style={{ marginTop: "1.25rem" }}>
              <Link href={`/events/${eventData.eventId}`} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
                View event →
              </Link>
            </div>
          </div>
        )}
      </section>

      <div style={{ paddingBottom: "3rem" }}>
        <Link href="/" className="btn btn-secondary">← Browse Events</Link>
      </div>
    </div>
  );
}
