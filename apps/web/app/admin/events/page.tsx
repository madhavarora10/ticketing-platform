"use client";
import { useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "dev-admin-key-change-in-production";

interface FormData {
  name: string; date: string; venue: string; description: string;
  totalTickets: string; basePrice: string; floorPrice: string; ceilingPrice: string;
  timeWeight: string; demandWeight: string; inventoryWeight: string;
}

const defaults: FormData = {
  name: "", date: "", venue: "", description: "",
  totalTickets: "500", basePrice: "1000", floorPrice: "800", ceilingPrice: "3000",
  timeWeight: "1.0", demandWeight: "1.0", inventoryWeight: "1.0",
};

interface CreatedEvent {
  id: string;
  name: string;
  date: string;
  venue: string;
  totalTickets: number;
  basePrice: number;
}

function SuccessModal({ event, onClose, onCreateAnother }: {
  event: CreatedEvent;
  onClose: () => void;
  onCreateAnother: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{
          position: "fixed", inset: 0, zIndex: 51,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "var(--bg-2, #1a1a2e)",
            border: "1px solid var(--border-1, rgba(255,255,255,0.1))",
            borderRadius: "var(--r-lg, 12px)",
            width: "100%",
            maxWidth: "480px",
            padding: "2rem",
            pointerEvents: "all",
            boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
            animation: "slideUp 0.25s ease",
          }}
        >
          {/* Icon */}
          <div style={{
            width: "56px", height: "56px", borderRadius: "50%",
            background: "rgba(34,197,94,0.15)",
            border: "2px solid rgba(34,197,94,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.5rem", marginBottom: "1.25rem",
          }}>
            ✓
          </div>

          <h2 id="modal-title" style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--text)" }}>
            Event Created!
          </h2>
          <p style={{ fontSize: "0.88rem", color: "var(--text-3)", marginBottom: "1.5rem" }}>
            Your event is now live on the platform with dynamic pricing enabled.
          </p>

          {/* Event summary */}
          <div style={{
            background: "var(--bg-3, rgba(255,255,255,0.04))",
            borderRadius: "var(--r, 8px)",
            padding: "1rem",
            marginBottom: "1.5rem",
            display: "flex", flexDirection: "column", gap: "0.6rem",
            fontSize: "0.85rem",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-3)" }}>Event</span>
              <span style={{ color: "var(--text)", fontWeight: 600, textAlign: "right", maxWidth: "260px" }}>{event.name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-3)" }}>Venue</span>
              <span style={{ color: "var(--text-2)" }}>{event.venue}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-3)" }}>Date</span>
              <span style={{ color: "var(--text-2)" }}>
                {new Date(event.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-3)" }}>Tickets</span>
              <span style={{ color: "var(--text-2)" }}>{event.totalTickets.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-3)" }}>Base Price</span>
              <span style={{ color: "var(--accent-light, #818cf8)", fontWeight: 600 }}>
                ₹{event.basePrice.toLocaleString()}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-3)" }}>Event ID</span>
              <code style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--text-3)" }}>{event.id}</code>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link
              href={`/events/${event.id}`}
              className="btn btn-primary"
              style={{ flex: 1, textAlign: "center" }}
            >
              View Event →
            </Link>
            <button
              className="btn btn-secondary"
              onClick={onCreateAnother}
              style={{ flex: 1 }}
            >
              Create Another
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </>
  );
}

export default function CreateEventPage() {
  const [form, setForm] = useState<FormData>(defaults);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [createdEvent, setCreatedEvent] = useState<CreatedEvent | null>(null);

  function set(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch(`${API}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_KEY}`,
        },
        body: JSON.stringify({
          name: form.name,
          date: form.date,
          venue: form.venue,
          description: form.description,
          totalTickets: Number(form.totalTickets),
          basePrice: Number(form.basePrice),
          floorPrice: Number(form.floorPrice),
          ceilingPrice: Number(form.ceilingPrice),
          pricingRules: {
            timeWeight: Number(form.timeWeight),
            demandWeight: Number(form.demandWeight),
            inventoryWeight: Number(form.inventoryWeight),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      // Show success modal with full event details
      setCreatedEvent({
        id: data.id,
        name: form.name,
        date: form.date,
        venue: form.venue,
        totalTickets: Number(form.totalTickets),
        basePrice: Number(form.basePrice),
      });
      setStatus("idle");
      setForm(defaults);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <>
      {/* Success Modal */}
      {createdEvent && (
        <SuccessModal
          event={createdEvent}
          onClose={() => setCreatedEvent(null)}
          onCreateAnother={() => setCreatedEvent(null)}
        />
      )}

      <div className="container page">
        <div className="page-header">
          <div className="page-header-top">
            <span className="page-tag">Admin</span>
            <span className="page-tag">POST /events</span>
          </div>
          <h1 className="page-title">Create Event</h1>
          <p className="page-desc">Add a new event to the platform with dynamic pricing configuration.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem", alignItems: "start" }}>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div className="card mb-2">
              <div className="card-header">
                <span className="card-title">Event Details</span>
              </div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Event Name *</label>
                  <input id="event-name" className="form-input" value={form.name} onChange={set("name")} placeholder="e.g. Coldplay World Tour — Mumbai" required />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Date &amp; Time *</label>
                    <input id="event-date" type="datetime-local" className="form-input" value={form.date} onChange={set("date")} onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()} required />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Venue *</label>
                    <input id="event-venue" className="form-input" value={form.venue} onChange={set("venue")} placeholder="e.g. DY Patil Stadium" required />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Description *</label>
                  <textarea id="event-desc" className="form-textarea" value={form.description} onChange={set("description")} placeholder="Describe the event..." required />
                </div>
              </div>
            </div>

            <div className="card mb-2">
              <div className="card-header">
                <span className="card-title">Tickets &amp; Pricing</span>
              </div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Total Tickets *</label>
                  <input id="total-tickets" type="number" min="1" className="form-input form-input-mono" value={form.totalTickets} onChange={set("totalTickets")} required />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Base Price (₹) *</label>
                    <input id="base-price" type="number" min="0" className="form-input form-input-mono" value={form.basePrice} onChange={set("basePrice")} required />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Floor Price (₹) *</label>
                    <input id="floor-price" type="number" min="0" className="form-input form-input-mono" value={form.floorPrice} onChange={set("floorPrice")} required />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Ceiling Price (₹) *</label>
                  <input id="ceiling-price" type="number" min="0" className="form-input form-input-mono" value={form.ceilingPrice} onChange={set("ceilingPrice")} />
                  <p className="form-hint">Price will never exceed this value regardless of demand.</p>
                </div>
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-header">
                <span className="card-title">Pricing Weights</span>
              </div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="form-row">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Time Weight</label>
                    <input id="time-weight" type="number" step="0.1" min="0" max="5" className="form-input form-input-mono" value={form.timeWeight} onChange={set("timeWeight")} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Demand Weight</label>
                    <input id="demand-weight" type="number" step="0.1" min="0" max="5" className="form-input form-input-mono" value={form.demandWeight} onChange={set("demandWeight")} />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Inventory Weight</label>
                  <input id="inv-weight" type="number" step="0.1" min="0" max="5" className="form-input form-input-mono" value={form.inventoryWeight} onChange={set("inventoryWeight")} style={{ maxWidth: "200px" }} />
                </div>
              </div>
            </div>

            {status === "error" && <div className="alert alert-error mb-2">✕ {errorMessage}</div>}

            <button id="create-event-btn" type="submit" className="btn btn-primary" disabled={status === "loading"} style={{ alignSelf: "flex-start", minWidth: "140px" }}>
              {status === "loading" ? <><div className="spinner" />Creating…</> : "Create Event"}
            </button>
          </form>

          <aside style={{ position: "sticky", top: "80px" }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Pricing Formula</span></div>
              <div className="card-body" style={{ fontSize: "0.78rem", color: "var(--text-2)", lineHeight: 1.8 }}>
                <p style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", background: "var(--bg-3)", padding: "0.75rem", borderRadius: "var(--r)", marginBottom: "1rem", color: "var(--text)" }}>
                  price = base × (<br/>
                  &nbsp;1<br/>
                  &nbsp;+ time × tW<br/>
                  &nbsp;+ demand × dW<br/>
                  &nbsp;+ inventory × iW<br/>
                  )
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <div><span style={{ color: "var(--accent)", fontFamily: "var(--mono)" }}>time</span> — 0.5 if &lt;1d, 0.2 if &lt;7d, 0.1 if &lt;30d</div>
                  <div><span style={{ color: "var(--accent)", fontFamily: "var(--mono)" }}>demand</span> — 0.15 if bookings &gt; threshold</div>
                  <div><span style={{ color: "var(--accent)", fontFamily: "var(--mono)" }}>inventory</span> — 0.25 if &lt;20% left, 0.1 if &lt;50%</div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
