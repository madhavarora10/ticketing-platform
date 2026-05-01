"use client";

import type { Metadata } from "next";
import { useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Booking {
  id: string;
  eventId: string;
  userEmail: string;
  quantity: number;
  pricePaid: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  createdAt: string;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyBookingsPage() {
  const [email, setEmail] = useState("");
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!email) { setError("Please enter your email"); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/bookings/user?email=${encodeURIComponent(email)}`);
      if (!res.ok) { setError("Failed to fetch bookings"); return; }
      const data = await res.json();
      setBookings(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const statusClass = (s: Booking["status"]) =>
    s === "CONFIRMED" ? "status-confirmed" : s === "PENDING" ? "status-pending" : "status-failed";

  return (
    <div className="container">
      <div style={{ padding: "3rem 0 2rem" }}>
        <h1 className="section-title" style={{ marginBottom: "0.5rem" }}>
          My Bookings
        </h1>
        <p className="text-secondary">
          Enter your email to view all your ticket bookings.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", maxWidth: "500px" }}>
          <input
            id="booking-email-input"
            type="email"
            className="form-input"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{ flex: 1 }}
          />
          <button
            id="search-bookings-btn"
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: "1rem", maxWidth: "500px" }}>
            {error}
          </div>
        )}
      </div>

      {bookings !== null && (
        <div className="section">
          {bookings.length === 0 ? (
            <div className="alert alert-info">
              No bookings found for <strong>{email}</strong>
            </div>
          ) : (
            <>
              <p className="text-secondary mb-2">
                Found {bookings.length} booking{bookings.length !== 1 ? "s" : ""} for{" "}
                <strong style={{ color: "var(--text-primary)" }}>{email}</strong>
              </p>
              <div className="bookings-list">
                {bookings.map((b) => (
                  <div key={b.id} className="booking-item">
                    <div className="booking-item-left">
                      <div className="booking-item-name">
                        Booking #{b.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="booking-item-meta">
                        {b.quantity} ticket{b.quantity > 1 ? "s" : ""} ·{" "}
                        {formatDate(b.createdAt)}
                      </div>
                      <div className="booking-item-meta" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                        Event: {b.eventId.slice(0, 16)}…
                      </div>
                    </div>
                    <div className="booking-item-right">
                      <div className="booking-item-price">
                        {formatPrice(Number(b.pricePaid) * b.quantity)}
                      </div>
                      <div className={`booking-item-status ${statusClass(b.status)}`}>
                        {b.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ paddingBottom: "3rem" }}>
        <Link href="/" className="btn btn-secondary">
          ← Browse Events
        </Link>
      </div>
    </div>
  );
}
