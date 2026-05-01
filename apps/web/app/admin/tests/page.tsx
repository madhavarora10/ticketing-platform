"use client";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "dev-admin-key-change-in-production";

// ─── Lookup: human-readable explanation for each test ────────────────────────
// Key = jest fullName (ancestorTitle + " " + title)
const TEST_EXPLANATIONS: Record<string, { what: string; why: string }> = {
  "timeAdjustment returns 0.0 when event is more than 30 days away": {
    what: "Time adjustment factor = 0.0 (no price increase)",
    why: "When an event is far away (31+ days), there's no urgency. The engine adds 0% on top of the base price — demand hasn't peaked yet.",
  },
  "timeAdjustment returns 0.1 when event is 8–30 days away": {
    what: "Time adjustment factor = 0.1 (+10% price increase)",
    why: "As the event enters the 8–30 day window, mild urgency kicks in. The engine bumps the base price by 10% to reflect rising demand.",
  },
  "timeAdjustment returns 0.2 when event is 2–7 days away": {
    what: "Time adjustment factor = 0.2 (+20% price increase)",
    why: "With only days to go, urgency is high. The engine applies a 20% uplift — last-minute buyers typically pay a premium.",
  },
  "timeAdjustment returns 0.5 when event is tomorrow (1 day)": {
    what: "Time adjustment factor = 0.5 (+50% price increase)",
    why: "With just 1 day left, scarcity and urgency are at their peak. The engine applies the maximum time-based uplift of 50%.",
  },
  "timeAdjustment returns 0.5 when event is today or past": {
    what: "Time adjustment factor = 0.5 (+50% price increase)",
    why: "Even on the day of or after the event, the engine maintains the 50% uplift rather than dropping to 0, preventing unexpected price drops.",
  },
  "demandAdjustment returns 0.15 when bookings exceed threshold": {
    what: "Demand adjustment factor = 0.15 (+15% demand surge)",
    why: "When recent bookings exceed the DEMAND_THRESHOLD (default: 10), demand surge pricing activates, adding 15% on top of the base price.",
  },
  "demandAdjustment returns 0.0 when bookings are at or below threshold": {
    what: "Demand adjustment factor = 0.0 (no demand surge)",
    why: "At or below the threshold, demand is considered normal. No surge pricing is applied — the base price stays unaffected by this factor.",
  },
  "demandAdjustment uses default threshold of 10 when env not set": {
    what: "Falls back to threshold = 10 when DEMAND_THRESHOLD env var is missing",
    why: "Validates the safe default behaviour: if no env var is configured, the engine correctly defaults to 10 bookings as the surge threshold.",
  },
  "inventoryAdjustment returns 0.25 when remaining < 20%": {
    what: "Inventory adjustment factor = 0.25 (+25% scarcity premium)",
    why: "When fewer than 20% of tickets remain, the event is nearly sold out. A 25% scarcity premium is applied to capture last-minute buyer willingness to pay.",
  },
  "inventoryAdjustment returns 0.25 when totalTickets is 0": {
    what: "Inventory adjustment factor = 0.25 (edge case: total = 0)",
    why: "Prevents a division-by-zero crash. If no tickets were ever allocated, the engine treats it as fully sold out and applies the maximum scarcity factor.",
  },
  "inventoryAdjustment returns 0.1 when remaining < 50%": {
    what: "Inventory adjustment factor = 0.1 (+10% low-inventory uplift)",
    why: "When 20–50% of tickets remain (more than half sold), the engine applies a moderate 10% uplift — the event is popular but not yet critical.",
  },
  "inventoryAdjustment returns 0.0 when more than 50% remaining": {
    what: "Inventory adjustment factor = 0.0 (no scarcity premium)",
    why: "More than 50% of tickets still available means plenty of supply. No inventory pressure exists, so the base price is unchanged by this factor.",
  },
  "calculatePrice calculates combined price correctly": {
    what: "All three factors stack correctly into the final price",
    why: "Confirms the formula: price = base × (1 + time×w + demand×w + inventory×w). With time=0.2, demand=0, inventory=0.25, a $1,000 base becomes $1,450.",
  },
  "calculatePrice clamps to ceilingPrice when raw price exceeds ceiling": {
    what: "Price is capped at ceilingPrice if adjustments push it too high",
    why: "Prevents runaway pricing. Even if all three factors fire simultaneously, the final price can never exceed the configured ceiling — protects buyers.",
  },
  "calculatePrice clamps to floorPrice when raw price is below floor": {
    what: "Price is floored at floorPrice if adjustments result in a price below it",
    why: "Ensures minimum revenue per ticket. If adjustments don't apply and the base price is lower than the floor, the floor price is returned instead.",
  },
  "calculatePrice applies custom weights from pricingRules": {
    what: "Custom weights in pricingRules override the env-var defaults",
    why: "Per-event overrides let operators tune how aggressively each factor affects pricing. E.g. doubling timeWeight doubles the urgency price bump.",
  },
  "calculatePriceBreakdown returns correct breakdown shape": {
    what: "The breakdown object contains all factor details (factor, weight, contribution)",
    why: "Validates the full audit trail — each adjustment exposes its raw factor, configured weight, and dollar contribution so admins can inspect exactly why a price changed.",
  },
  "calculatePriceBreakdown matches the article example: base=1000, time=0.20, demand=0.15, inventory=0.25 → 1600": {
    what: "Concrete end-to-end check: $1,000 base → $1,600 final",
    why: "The canonical reference example: time (+20%) + demand (+15%) + inventory (+25%) = +60% total. $1,000 × 1.6 = $1,600. Regression guard for the documented formula.",
  },
  "edge cases handles event tomorrow with 0 tickets remaining and high demand": {
    what: "All three factors fire simultaneously at maximum values",
    why: "Stress test: time=0.5 + demand=0.15 + inventory=0.25 = +90%. $1,000 × 1.9 = $1,900. Validates the engine doesn't clip or mis-sum when all factors are active.",
  },
  "edge cases handles demand at exact threshold (should return 0.0)": {
    what: "Demand = threshold exactly → 0.0, not 0.15",
    why: "Boundary condition: the surge only fires when bookings strictly exceed the threshold. Being exactly at the threshold is not a surge — protects against premature price hikes.",
  },
};

interface JestTestResult {
  ancestorTitles: string[];
  title: string;
  fullName: string;
  status: "passed" | "failed" | "pending";
  duration?: number;
  failureMessages?: string[];
}

// Jest --json emits each suite's individual tests under "assertionResults", not "testResults"
interface JestSuite {
  name: string; // Jest puts the file path in 'name'
  assertionResults: JestTestResult[];
  status: "passed" | "failed";
}

interface JestOutput {
  numPassedTests: number;
  numFailedTests: number;
  numTotalTests: number;
  testResults: JestSuite[];
  success: boolean;
  startTime: number;
}

interface RunResult {
  success: boolean;
  raw: string;
  stderr: string;
  parsed: JestOutput | null;
}

function TestCaseRow({ t }: { t: JestTestResult }) {
  const [expanded, setExpanded] = useState(false);
  const explanation = TEST_EXPLANATIONS[t.fullName];

  return (
    <div
      className="test-case"
      style={{ flexDirection: "column", alignItems: "flex-start", cursor: explanation ? "pointer" : "default", gap: 0 }}
      onClick={() => explanation && setExpanded(v => !v)}
    >
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "0.5rem" }}>
        {t.status === "passed"
          ? <span className="test-icon-pass">✓</span>
          : <span className="test-icon-fail">✕</span>}
        <span className="test-case-name" style={{ flex: 1 }}>
          {t.ancestorTitles.length > 0 && (
            <span style={{ color: "var(--text-3)" }}>{t.ancestorTitles.join(" › ")} › </span>
          )}
          {t.title}
        </span>
        {t.duration !== undefined && (
          <span className="test-duration">{t.duration}ms</span>
        )}
        {explanation && (
          <span style={{ fontSize: "0.7rem", color: "var(--text-3)", marginLeft: "0.25rem" }}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Expandable explanation */}
      {expanded && explanation && (
        <div style={{
          marginTop: "0.5rem",
          marginLeft: "1.75rem",
          padding: "0.75rem 1rem",
          background: "var(--surface-2, rgba(255,255,255,0.04))",
          borderRadius: "var(--r-md, 6px)",
          borderLeft: "3px solid var(--accent, #6366f1)",
          fontSize: "0.8rem",
          lineHeight: 1.6,
          width: "calc(100% - 1.75rem)",
        }}>
          <div style={{ marginBottom: "0.4rem" }}>
            <span style={{
              display: "inline-block",
              background: "var(--accent, #6366f1)",
              color: "#fff",
              borderRadius: "4px",
              padding: "0.1rem 0.45rem",
              fontSize: "0.7rem",
              fontWeight: 600,
              marginRight: "0.5rem",
              letterSpacing: "0.02em",
            }}>RETURNS</span>
            <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{explanation.what}</span>
          </div>
          <div style={{ color: "var(--text-3)" }}>{explanation.why}</div>
        </div>
      )}

      {/* Failure message */}
      {t.status === "failed" && t.failureMessages && t.failureMessages.length > 0 && (
        <pre style={{
          marginTop: "0.5rem",
          marginLeft: "1.75rem",
          padding: "0.5rem 0.75rem",
          background: "rgba(239,68,68,0.08)",
          borderLeft: "3px solid var(--danger, #ef4444)",
          borderRadius: "4px",
          fontSize: "0.75rem",
          color: "var(--danger, #ef4444)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          width: "calc(100% - 1.75rem)",
        }}>
          {t.failureMessages[0]}
        </pre>
      )}
    </div>
  );
}

function SuiteBlock({ suite }: { suite: JestSuite }) {
  const filePath = suite.name ?? "";
  const fileName = filePath ? filePath.split(/[/\\]/).pop() ?? filePath : "(unknown file)";

  const assertionResults = suite.assertionResults ?? [];
  const passedCount = assertionResults.filter(t => t.status === "passed").length;
  const failedCount = assertionResults.filter(t => t.status === "failed").length;
  const allPassed = suite.status === "passed" || failedCount === 0;

  return (
    <div className="test-suite">
      <div className="test-suite-header">
        <span style={{ color: allPassed ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
          {allPassed ? "✓ PASS" : "✕ FAIL"}
        </span>
        <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{fileName}</span>
        <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "0.75rem" }}>
          {passedCount} passed · {failedCount} failed
        </span>
      </div>
      <div style={{ padding: "0.4rem 0.75rem", fontSize: "0.78rem", color: "var(--text-3)", borderBottom: "1px solid var(--border-1, rgba(255,255,255,0.06))" }}>
        Click any test row to see what the returned value means and what the test is verifying.
      </div>
      {assertionResults.map((t, i) => (
        <TestCaseRow key={i} t={t} />
      ))}
    </div>
  );
}

export default function TestsPage() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<RunResult | null>(null);

  async function runTests() {
    setStatus("running");
    setResult(null);
    try {
      const res = await fetch(`${API}/admin/run-tests`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_KEY}` },
      });
      const data = (await res.json()) as RunResult;
      setResult(data);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  const parsed = result?.parsed;
  const totalMs = parsed ? Date.now() - parsed.startTime : 0;

  return (
    <div className="container page">
      <div className="page-header">
        <div className="page-header-top">
          <span className="page-tag">Admin</span>
          <span className="page-tag">@repo/pricing</span>
        </div>
        <h1 className="page-title">Run Tests</h1>
        <p className="page-desc">
          Execute the Jest test suite for the pricing engine and inspect results in real time.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <button
          id="run-tests-btn"
          className="btn btn-primary"
          onClick={runTests}
          disabled={status === "running"}
          style={{ minWidth: "140px" }}
        >
          {status === "running" ? (
            <><div className="spinner" />Running…</>
          ) : (
            "▶ Run Tests"
          )}
        </button>

        {status === "done" && parsed && (
          <div className="test-summary">
            <span className="test-sum-pass">✓ {parsed.numPassedTests} passed</span>
            {parsed.numFailedTests > 0 && (
              <span className="test-sum-fail">✕ {parsed.numFailedTests} failed</span>
            )}
            <span className="test-sum-time">{parsed.numTotalTests} total · {totalMs}ms</span>
          </div>
        )}
      </div>

      {status === "error" && (
        <div className="alert alert-error">
          Could not reach the API. Make sure <code style={{ fontFamily: "var(--mono)" }}>pnpm dev</code> is running.
        </div>
      )}

      {status === "done" && result && (
        <>
          {parsed && parsed.testResults.length > 0 ? (
            <div style={{ marginBottom: "2rem" }}>
              {parsed.testResults.map((suite, i) => (
                <SuiteBlock key={i} suite={suite} />
              ))}
            </div>
          ) : (
            <div className="alert alert-warn mb-2">
              Could not parse structured JSON output. See raw output below.
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <span className="card-title">Raw Output</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-3)", fontFamily: "var(--mono)" }}>stdout + stderr</span>
            </div>
            <div className="card-body" style={{ padding: "1rem" }}>
              <pre className="raw-output">{result.raw || result.stderr || "(empty)"}</pre>
            </div>
          </div>
        </>
      )}

      {status === "idle" && (
        <div style={{ border: "1px dashed var(--border-2)", borderRadius: "var(--r-lg)", padding: "3rem", textAlign: "center", color: "var(--text-3)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⬡</div>
          <div style={{ fontSize: "0.88rem" }}>Hit <strong style={{ color: "var(--text-2)" }}>Run Tests</strong> to execute the pricing engine test suite</div>
        </div>
      )}
    </div>
  );
}
