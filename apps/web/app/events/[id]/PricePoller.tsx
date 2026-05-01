"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface PriceAdjustment {
  factor: number;
  weight: number;
  contribution: number;
}

interface PriceBreakdown {
  basePrice: number;
  currentPrice: number;
  breakdown: {
    timeAdjustment: PriceAdjustment;
    demandAdjustment: PriceAdjustment;
    inventoryAdjustment: PriceAdjustment;
  };
}

interface PricePollerProps {
  eventId: string;
  eventName: string;
  initialBreakdown: PriceBreakdown;
  totalTickets: number;
  bookedTickets: number;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatFactor(factor: number) {
  return factor > 0 ? `+${(factor * 100).toFixed(0)}%` : "–";
}

export function PricePoller({
  eventId,
  eventName,
  initialBreakdown,
  totalTickets,
  bookedTickets: initialBooked,
}: PricePollerProps) {
  const router = useRouter();
  const [breakdown, setBreakdown] = useState<PriceBreakdown>(initialBreakdown);
  const [bookedTickets, setBookedTickets] = useState(initialBooked);
  const [quantity, setQuantity] = useState(1);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [justUpdated, setJustUpdated] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Immediate fetch on mount to get fresh state ───────────────────────────
  useEffect(() => {
    fetch(`${API}/events/${eventId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.priceBreakdown) setBreakdown(data.priceBreakdown);
        if (typeof data.bookedTickets === "number") setBookedTickets(data.bookedTickets);
        setLastUpdated(new Date());
      })
      .catch(() => { /* keep showing initialBreakdown on error */ });
  }, [eventId]);

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`${API}/events/${eventId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.priceBreakdown) setBreakdown(data.priceBreakdown);
      if (typeof data.bookedTickets === "number") setBookedTickets(data.bookedTickets);
      setLastUpdated(new Date());
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 800);
    } catch {
      // silently fail — keep showing last known data
    }
  }, [eventId]);

  // SSE: receive live inventory pushes
  useEffect(() => {
    const source = new EventSource(`${API}/events/${eventId}/stream`);
    source.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as { bookedTickets: number };
        if (typeof data.bookedTickets === "number") {
          setBookedTickets(data.bookedTickets);
          setLastUpdated(new Date());
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 800);
        }
      } catch { /* malformed — ignore */ }
    };
    return () => source.close();
  }, [eventId]);

  // Suppress unused warning — fetchEvent is available for manual refresh
  void fetchEvent;

  const available = totalTickets - bookedTickets;
  const soldPct = Math.round((bookedTickets / totalTickets) * 100);
  const totalCost = breakdown.currentPrice * quantity;
  const { timeAdjustment, demandAdjustment, inventoryAdjustment } = breakdown.breakdown;

  function handleCheckout() {
    const params = new URLSearchParams({
      eventId,
      eventName,
      qty: String(quantity),
      price: String(breakdown.currentPrice),
    });
    router.push(`/bookings/checkout?${params.toString()}`);
  }

  return (
    <div className="detail-card">
      <div className="price-card-title">
        Live Pricing
        <span
          className="price-live-badge"
          style={{
            transition: "background 0.3s",
            background: available === 0
              ? "rgba(239,68,68,0.12)"
              : justUpdated ? "rgba(99,102,241,0.25)" : undefined,
            color: available === 0 ? "var(--danger)" : undefined,
            borderColor: available === 0 ? "rgba(239,68,68,0.3)" : undefined,
          }}
        >
          {available === 0
            ? "SOLD OUT"
            : mounted
            ? `LIVE · ${lastUpdated.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" })}`
            : "LIVE"}
        </span>
      </div>

      <div className="price-current">{formatPrice(breakdown.currentPrice)}</div>
      <div className="price-base">Base price: {formatPrice(breakdown.basePrice)}</div>

      {/* Live availability bar */}
      <div style={{ margin: "0.75rem 0 1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-3)", marginBottom: "0.35rem" }}>
          <span>
            <span style={{ color: available === 0 ? "var(--danger)" : available < totalTickets * 0.2 ? "var(--warning, #f59e0b)" : "var(--success)" }}>
              {available.toLocaleString()}
            </span>
            {" "}of {totalTickets.toLocaleString()} tickets remaining
          </span>
          <span>{soldPct}% sold</span>
        </div>
        <div className="availability-bar" style={{ width: "100%", height: "6px" }}>
          <div
            className={`availability-fill ${soldPct > 80 ? "fill-red" : soldPct > 50 ? "fill-yellow" : "fill-green"}`}
            style={{ width: `${soldPct}%`, transition: "width 0.6s ease" }}
          />
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="breakdown-list">
        <div className="breakdown-row">
          <span className="breakdown-label">⏰ Time Surge</span>
          <span className={`breakdown-value ${timeAdjustment.factor > 0 ? "positive" : "zero"}`}>
            {formatFactor(timeAdjustment.factor)}{timeAdjustment.factor > 0 && ` (+${formatPrice(timeAdjustment.contribution)})`}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">🔥 Demand Surge</span>
          <span className={`breakdown-value ${demandAdjustment.factor > 0 ? "positive" : "zero"}`}>
            {formatFactor(demandAdjustment.factor)}{demandAdjustment.factor > 0 && ` (+${formatPrice(demandAdjustment.contribution)})`}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">📉 Scarcity Premium</span>
          <span className={`breakdown-value ${inventoryAdjustment.factor > 0 ? "positive" : "zero"}`}>
            {formatFactor(inventoryAdjustment.factor)}{inventoryAdjustment.factor > 0 && ` (+${formatPrice(inventoryAdjustment.contribution)})`}
          </span>
        </div>
        <hr className="breakdown-divider" />
        <div className="breakdown-row">
          <span className="breakdown-label" style={{ fontWeight: 600 }}>Current Price</span>
          <span className="breakdown-value" style={{ color: "var(--accent)" }}>
            {formatPrice(breakdown.currentPrice)}
          </span>
        </div>
      </div>

      {/* Quantity */}
      <div className="quantity-selector">
        <span className="quantity-label">Qty</span>
        <div className="quantity-control">
          <button className="quantity-btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Decrease quantity">−</button>
          <span className="quantity-value">{quantity}</span>
          <button className="quantity-btn" onClick={() => setQuantity((q) => Math.min(available, q + 1))} disabled={quantity >= available} aria-label="Increase quantity">+</button>
        </div>
      </div>

      {/* Total */}
      <div className="total-price-row">
        <span className="total-label">Total ({quantity} ticket{quantity > 1 ? "s" : ""})</span>
        <span className="total-value">{formatPrice(totalCost)}</span>
      </div>

      <button
        id="checkout-btn"
        className="btn btn-primary w-full"
        onClick={handleCheckout}
        disabled={available === 0}
      >
        {available === 0 ? "Sold Out" : "Proceed to Checkout →"}
      </button>

      <p className="text-muted mt-2" style={{ fontSize: "0.78rem", textAlign: "center" }}>
        🔒 Price locked for 5 minutes at checkout
      </p>
    </div>
  );
}
