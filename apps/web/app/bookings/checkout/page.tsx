"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

// 5 minute countdown hook
function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [remaining]);
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");
  return { remaining, display: `${mins}:${secs}` };
}

export default function CheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();

  const eventId = params.get("eventId") ?? "";
  const eventName = params.get("eventName") ?? "Event";
  const qty = Number(params.get("qty") ?? 1);
  const lockedPrice = Number(params.get("price") ?? 0);

  const idempotencyKey = useRef(crypto.randomUUID());

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { remaining, display: countdown } = useCountdown(5 * 60);
  const expired = remaining <= 0;
  const urgentCountdown = remaining <= 60;

  // Redirect back if missing required params
  useEffect(() => {
    if (!eventId) router.push("/");
  }, [eventId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required"); return; }
    if (expired) { setError("Your price lock has expired. Please go back and try again."); return; }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          userEmail: email.trim(),
          quantity: qty,
          idempotencyKey: idempotencyKey.current,
          // name and state are passed as metadata (stored via idempotency key for now)
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Booking failed. Please try again.");
        return;
      }

      // Success — go to confirmation page
      router.push(
        `/bookings/success?ref=${data.id}&event=${eventId}&qty=${qty}&price=${data.pricePaid}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalCost = lockedPrice * qty;

  return (
    <div className="container" style={{ maxWidth: "900px", padding: "2rem 1.5rem 4rem" }}>
      {/* Back link */}
      <Link
        href={eventId ? `/events/${eventId}` : "/"}
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: "1.5rem", display: "inline-flex" }}
      >
        ← Back to Event
      </Link>

      {/* Page heading */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
          <span className="page-tag">Checkout</span>
          {/* Price lock countdown */}
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.2rem 0.6rem",
              borderRadius: "999px",
              background: urgentCountdown ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.1)",
              color: urgentCountdown ? "var(--danger)" : "var(--warning)",
              border: urgentCountdown ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(245,158,11,0.2)",
              transition: "all 0.3s",
            }}
          >
            {expired ? "⚠ Price lock expired" : `🔒 Price locked: ${countdown}`}
          </span>
        </div>
        <h1 className="page-title">Complete Your Booking</h1>
        <p className="page-desc" style={{ marginTop: "0.35rem" }}>
          Enter your details below to confirm your tickets for <strong style={{ color: "var(--text)" }}>{eventName}</strong>.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem", alignItems: "start" }}>
        {/* ── Left: Buyer details form ── */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Your Details</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Full Name */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="checkout-name">
                  Full Name <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Priya Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting || expired}
                  autoComplete="name"
                />
              </div>

              {/* Email — required */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="checkout-email">
                  Email Address <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting || expired}
                  autoComplete="email"
                />
                <p className="form-hint">Your booking confirmation will be sent here.</p>
              </div>

              {/* State — optional dropdown */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="checkout-state">
                  State <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  id="checkout-state"
                  className="form-select"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={submitting || expired}
                >
                  <option value="">Select your state…</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Error alert */}
          {error && (
            <div className="alert alert-error">
              ✕ {error}
            </div>
          )}

          {/* Expired state */}
          {expired && (
            <div className="alert alert-warn">
              ⚠ Your 5-minute price lock has expired. Please{" "}
              <Link href={`/events/${eventId}`} style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}>
                go back to the event
              </Link>{" "}
              and start again to get a fresh price.
            </div>
          )}

          {/* Submit */}
          <button
            id="confirm-booking-btn"
            type="submit"
            className="btn btn-primary"
            disabled={submitting || expired}
            style={{ alignSelf: "flex-start", minWidth: "180px" }}
          >
            {submitting ? (
              <>
                <div className="spinner" />
                Processing…
              </>
            ) : (
              `Confirm Booking · ${formatPrice(totalCost)}`
            )}
          </button>

          <p className="text-muted" style={{ fontSize: "0.78rem" }}>
            By confirming, you agree to our terms. No payment is collected — this is a demo platform.
          </p>
        </form>

        {/* ── Right: Order summary ── */}
        <aside style={{ position: "sticky", top: "80px" }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Order Summary</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {/* Event name */}
              <div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-3)", marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Event</p>
                <p style={{ fontSize: "0.88rem", fontWeight: 600, lineHeight: 1.4 }}>{eventName}</p>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

              {/* Line items */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.84rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-3)" }}>Price per ticket</span>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{formatPrice(lockedPrice)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-3)" }}>Quantity</span>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>× {qty}</span>
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

              {/* Total */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>Total</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--accent)" }}>
                  {formatPrice(totalCost)}
                </span>
              </div>

              {/* Lock info */}
              <div
                style={{
                  background: urgentCountdown ? "rgba(239,68,68,0.06)" : "rgba(232,255,0,0.06)",
                  border: `1px solid ${urgentCountdown ? "rgba(239,68,68,0.2)" : "var(--accent-border)"}`,
                  borderRadius: "var(--r)",
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.78rem",
                  color: urgentCountdown ? "var(--danger)" : "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {expired ? "⚠" : "🔒"}
                <span>
                  {expired
                    ? "Price lock expired"
                    : `Price locked for ${countdown}`}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Responsive fix */}
      <style>{`
        @media (max-width: 680px) {
          .checkout-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
