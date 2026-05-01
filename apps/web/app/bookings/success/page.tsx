import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Booking Confirmed — TicketFlow",
  description: "Your ticket booking has been confirmed.",
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; event?: string; qty?: string; price?: string; name?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const ref = sp.ref ?? "—";
  const qty = Number(sp.qty ?? 1);
  const price = Number(sp.price ?? 0);
  const name = sp.name ?? "";
  const email = sp.email ?? "";

  return (
    <div className="success-page">
      <div className="success-card">
        <div className="success-icon">🎉</div>
        <h1 className="success-title">Booking Confirmed!</h1>
        <p className="text-secondary">
          Your tickets have been reserved. You&apos;ll receive a confirmation
          shortly.
        </p>

        <div className="success-ref">{ref}</div>

        <div style={{ textAlign: "left", marginBottom: "2rem" }}>
          <div className="booking-detail-row">
            <span className="booking-detail-label">Booking Reference</span>
            <span className="booking-detail-value" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
              {ref.slice(0, 16)}…
            </span>
          </div>
          {name && (
            <div className="booking-detail-row">
              <span className="booking-detail-label">Name</span>
              <span className="booking-detail-value">{name}</span>
            </div>
          )}
          {email && (
            <div className="booking-detail-row">
              <span className="booking-detail-label">Email</span>
              <span className="booking-detail-value" style={{ fontFamily: "inherit", fontWeight: 500, fontSize: "0.82rem" }}>{email}</span>
            </div>
          )}
          <div className="booking-detail-row">
            <span className="booking-detail-label">Tickets</span>
            <span className="booking-detail-value">{qty}</span>
          </div>
          <div className="booking-detail-row">
            <span className="booking-detail-label">Price Paid</span>
            <span className="booking-detail-value text-accent">
              {formatPrice(price)} per ticket
            </span>
          </div>
          <div className="booking-detail-row">
            <span className="booking-detail-label">Total</span>
            <span className="booking-detail-value text-accent">
              {formatPrice(price * qty)}
            </span>
          </div>
          <div className="booking-detail-row">
            <span className="booking-detail-label">Status</span>
            <span className="booking-detail-value text-success">✓ CONFIRMED</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <Link href="/" className="btn btn-primary" style={{ flex: 1 }}>
            Browse More Events
          </Link>
          <Link href="/my-bookings" className="btn btn-secondary" style={{ flex: 1 }}>
            My Bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
