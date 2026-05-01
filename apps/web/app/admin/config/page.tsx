"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "dev-admin-key-change-in-production";

interface Config {
  DEMAND_THRESHOLD: string;
  TIME_WEIGHT: string;
  DEMAND_WEIGHT: string;
  INVENTORY_WEIGHT: string;
}

const FIELDS: { key: keyof Config; label: string; hint: string; step: string; min: string; max: string }[] = [
  {
    key: "DEMAND_THRESHOLD",
    label: "DEMAND_THRESHOLD",
    hint: "Bookings per hour above this trigger the +15% demand surcharge.",
    step: "1", min: "1", max: "1000",
  },
  {
    key: "TIME_WEIGHT",
    label: "TIME_WEIGHT",
    hint: "Multiplier for the time-based adjustment factor (0 to disable).",
    step: "0.1", min: "0", max: "5",
  },
  {
    key: "DEMAND_WEIGHT",
    label: "DEMAND_WEIGHT",
    hint: "Multiplier for the demand-based adjustment factor (0 to disable).",
    step: "0.1", min: "0", max: "5",
  },
  {
    key: "INVENTORY_WEIGHT",
    label: "INVENTORY_WEIGHT",
    hint: "Multiplier for the inventory-based adjustment factor (0 to disable).",
    step: "0.1", min: "0", max: "5",
  },
];

function headers() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_KEY}` };
}

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>({
    DEMAND_THRESHOLD: "10",
    TIME_WEIGHT: "1.0",
    DEMAND_WEIGHT: "1.0",
    INVENTORY_WEIGHT: "1.0",
  });
  const [draft, setDraft] = useState<Config | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ok" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    fetch(`${API}/admin/config`, { headers: headers() })
      .then((r) => r.json())
      .then((data: Config) => {
        setConfig(data);
        setDraft(data);
        setLoadStatus("ok");
      })
      .catch(() => setLoadStatus("error"));
  }, []);

  function setField(key: keyof Config, value: string) {
    setDraft((d) => d ? { ...d, [key]: value } : null);
  }

  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(config);

  async function save() {
    if (!draft) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`${API}/admin/config`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(draft),
      });
      const data = await res.json() as Config;
      if (!res.ok) throw new Error((data as unknown as { error: string }).error);
      setConfig(data);
      setDraft(data);
      setSaveStatus("ok");
      setSaveMsg("Saved — .env updated and process.env patched live.");
    } catch (err) {
      setSaveStatus("error");
      setSaveMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  function reset() {
    setDraft(config);
    setSaveStatus("idle");
  }

  if (loadStatus === "loading") {
    return (
      <div className="container page">
        <div className="page-header">
          <div className="page-header-top"><span className="page-tag">Admin</span><span className="page-tag">Config</span></div>
          <h1 className="page-title">Pricing Config</h1>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", color: "var(--text-3)", fontSize: "0.88rem" }}>
          <div className="spinner" /> Loading current values from API…
        </div>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="container page">
        <div className="page-header">
          <div className="page-header-top"><span className="page-tag">Admin</span></div>
          <h1 className="page-title">Pricing Config</h1>
        </div>
        <div className="alert alert-error">Could not reach the API. Make sure <code style={{ fontFamily: "var(--mono)" }}>pnpm dev</code> is running.</div>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-header">
        <div className="page-header-top">
          <span className="page-tag">Admin</span>
          <span className="page-tag">PATCH /admin/config</span>
        </div>
        <h1 className="page-title">Pricing Config</h1>
        <p className="page-desc">
          Edit the four pricing engine variables. Changes are written to <code style={{ fontFamily: "var(--mono)", color: "var(--accent)", fontSize: "0.82rem" }}>apps/api/.env</code> and applied to the running process immediately — no restart required.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem", alignItems: "start" }}>
        <div>
          <div className="card mb-3">
            <div className="card-header">
              <span className="card-title">Environment Variables</span>
              {dirty && <span style={{ fontSize: "0.72rem", color: "var(--warning)", fontFamily: "var(--mono)" }}>● unsaved changes</span>}
            </div>
            <div className="card-body">
              {FIELDS.map((f) => (
                <div className="config-row" key={f.key}>
                  <span className="config-key">{f.label}</span>
                  <span className="config-desc">{f.hint}</span>
                  <input
                    id={`cfg-${f.key.toLowerCase()}`}
                    type="number"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    className="form-input form-input-mono config-input"
                    value={draft?.[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {saveStatus === "ok" && <div className="alert alert-success mb-2">✓ {saveMsg}</div>}
          {saveStatus === "error" && <div className="alert alert-error mb-2">✕ {saveMsg}</div>}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              id="save-config-btn"
              className="btn btn-primary"
              onClick={save}
              disabled={!dirty || saveStatus === "saving"}
              style={{ minWidth: "120px" }}
            >
              {saveStatus === "saving" ? <><div className="spinner" />Saving…</> : "Save Changes"}
            </button>
            <button className="btn btn-ghost" onClick={reset} disabled={!dirty}>Reset</button>
          </div>
        </div>

        <aside style={{ position: "sticky", top: "80px" }}>
          <div className="card mb-2">
            <div className="card-header"><span className="card-title">Current Values</span></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {FIELDS.map((f) => (
                <div key={f.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                  <span style={{ color: "var(--text-3)", fontFamily: "var(--mono)" }}>{f.label}</span>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{config[f.key]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">How it works</span></div>
            <div className="card-body" style={{ fontSize: "0.78rem", color: "var(--text-2)", lineHeight: 1.8 }}>
              <p>Changes call <code style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>PATCH /admin/config</code>, which:</p>
              <ol style={{ paddingLeft: "1rem", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <li>Validates each value is a non-negative number</li>
                <li>Updates <code style={{ fontFamily: "var(--mono)" }}>process.env</code> immediately</li>
                <li>Rewrites the matching lines in <code style={{ fontFamily: "var(--mono)" }}>.env</code> on disk</li>
              </ol>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
