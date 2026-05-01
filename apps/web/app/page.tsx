"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface EventItem {
  id: string;
  name: string;
  date: string;
  venue: string;
  status: "ACTIVE" | "CANCELLED" | "SOLD_OUT";
  totalTickets: number;
  bookedTickets: number;
  currentPrice: number;
  availableTickets: number;
}

interface Analytics {
  totalEvents: number;
  activeEvents: number;
  totalBookings: number;
  totalRevenue: number;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function getAvailabilityColor(available: number, total: number) {
  const pct = available / total;
  if (pct < 0.2) return "fill-red";
  if (pct < 0.5) return "fill-yellow";
  return "fill-green";
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    try {
      const [evRes, anRes] = await Promise.all([
        fetch(`${API}/events`, { cache: "no-store" }),
        fetch(`${API}/analytics/summary`, { cache: "no-store" }),
      ]);
      if (evRes.ok) setEvents(await evRes.json());
      if (anRes.ok) setAnalytics(await anRes.json());
    } catch {
      // keep previous data on failure
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // Poll every 5 seconds so ticket counts reflect bookings quickly
    const id = setInterval(fetchAll, 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="container">
      {/* Hero */}
      <div className="hero">
        <div className="hero-eyebrow">Live Ticketing Platform</div>
        <h1 className="hero-title">
          Book tickets.<br /><em>Pay the right price.</em>
        </h1>
        <p className="hero-desc">
          Real-time dynamic pricing, distributed booking protection, and zero overbooking.
        </p>

        {analytics && (
          <div className="stats-bar">
            <div className="stat-item">
              <div className="stat-value">{analytics.totalEvents}</div>
              <div className="stat-label">Total Events</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{analytics.activeEvents}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{analytics.totalBookings}</div>
              <div className="stat-label">Bookings</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{formatPrice(analytics.totalRevenue)}</div>
              <div className="stat-label">Revenue</div>
            </div>
          </div>
        )}
      </div>

      {/* Events */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Upcoming Events</h2>
            <p className="section-subtitle">
              Prices and availability update every few seconds
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>
            Loading events…
          </div>
        ) : events.length === 0 ? (
          <div className="alert alert-info">
            No events found. Run{" "}
            <code style={{ fontFamily: "monospace" }}>POST /seed</code> to load sample data.
          </div>
        ) : (
          <div className="event-grid">
            {events.map((event) => {
              const available = event.totalTickets - event.bookedTickets;
              // Show remaining percentage of what's left (not sold)
              const fillPct = Math.round((available / event.totalTickets) * 100);
              const fillColor = getAvailabilityColor(available, event.totalTickets);

              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="event-card"
                >
                  <div className="event-card-header">
                    <span
                      className={`event-status-badge ${
                        event.status === "ACTIVE"
                          ? "badge-active"
                          : event.status === "SOLD_OUT"
                          ? "badge-sold-out"
                          : "badge-cancelled"
                      }`}
                    >
                      {event.status === "ACTIVE"
                        ? "● On Sale"
                        : event.status === "SOLD_OUT"
                        ? "Sold Out"
                        : "Cancelled"}
                    </span>
                  </div>

                  <div className="event-name">{event.name}</div>

                  <div className="event-meta">
                    <div className="event-meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {formatDate(event.date)}
                    </div>
                    <div className="event-meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {event.venue}
                    </div>
                  </div>

                  <div className="event-card-footer">
                    <div className="event-price">
                      <span className="price-label">From</span>
                      <span className="price-value">{formatPrice(event.currentPrice)}</span>
                    </div>
                    <div className="availability-bar-wrap">
                      <span className="availability-text">{available.toLocaleString()} left</span>
                      <div className="availability-bar">
                        <div
                          className={`availability-fill ${fillColor}`}
                          style={{ width: `${fillPct}%`, transition: "width 0.6s ease" }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
