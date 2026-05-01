import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PricePoller } from "./PricePoller";
import { LiveAvailability } from "./LiveAvailability";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface EventDetail {
  id: string;
  name: string;
  date: string;
  venue: string;
  description: string;
  status: "ACTIVE" | "CANCELLED" | "SOLD_OUT";
  totalTickets: number;
  bookedTickets: number;
  basePrice: string;
  floorPrice: string;
  ceilingPrice: string;
  availableTickets: number;
  priceBreakdown: {
    basePrice: number;
    currentPrice: number;
    breakdown: {
      timeAdjustment: { factor: number; weight: number; contribution: number };
      demandAdjustment: { factor: number; weight: number; contribution: number };
      inventoryAdjustment: { factor: number; weight: number; contribution: number };
    };
  };
}

async function getEvent(id: string): Promise<EventDetail | null> {
  try {
    const res = await fetch(`${API}/events/${id}`, { next: { revalidate: 10 } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return { title: "Event Not Found" };
  return {
    title: `${event.name} — TicketFlow`,
    description: event.description,
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) notFound();



  return (
    <div className="container">
      <div style={{ padding: "1.5rem 0 0" }}>
        <Link
          href="/"
          className="btn btn-secondary"
          style={{ display: "inline-flex", marginBottom: "1.5rem" }}
        >
          ← Back to Events
        </Link>
      </div>

      <div className="event-detail-grid">
        {/* Left — Event info (Server Component) */}
        <div>
          <div className="detail-card" style={{ marginBottom: "1.5rem" }}>
            <span
              className={`event-status-badge ${
                event.status === "ACTIVE"
                  ? "badge-active"
                  : event.status === "SOLD_OUT"
                  ? "badge-sold-out"
                  : "badge-cancelled"
              }`}
              style={{ marginBottom: "1rem", display: "inline-block" }}
            >
              {event.status === "ACTIVE"
                ? "● On Sale"
                : event.status === "SOLD_OUT"
                ? "Sold Out"
                : "Cancelled"}
            </span>

            <h1 className="event-detail-title">{event.name}</h1>

            <div className="detail-meta">
              <div className="detail-meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {formatDate(event.date)}
              </div>
              <div className="detail-meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {event.venue}
              </div>
            </div>

            {/* Live availability — client component updates via SSE */}
            <LiveAvailability
              eventId={event.id}
              totalTickets={event.totalTickets}
              initialBooked={event.bookedTickets}
            />

            <div className="detail-description">{event.description}</div>
          </div>
        </div>

        {/* Right — Price Poller (Client Island) */}
        <div>
          <PricePoller
            eventId={event.id}
            eventName={event.name}
            initialBreakdown={event.priceBreakdown}
            totalTickets={event.totalTickets}
            bookedTickets={event.bookedTickets}
          />
        </div>
      </div>
    </div>
  );
}
