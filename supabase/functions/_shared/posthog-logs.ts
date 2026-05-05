/**
 * Lightweight OTLP/JSON log exporter for PostHog Logs.
 *
 * Why hand-rolled (no `@opentelemetry/*` SDK):
 *   - Deno Edge Runtime has flaky compatibility with the npm OTel SDKs.
 *   - We only need log export — no traces, no metrics — so the OTLP/HTTP
 *     log spec is small enough to construct manually.
 *   - Zero cold-start cost: a single shape, a single fetch, no module init.
 *
 * Pattern:
 *   - One `createPostHogLogger({ service })` per Edge Function invocation.
 *   - Buffer log records in memory, then `flush()` once at the end of the
 *     handler. (Fire-and-forget per call would multiply egress requests
 *     by O(N) — buffering keeps it to one POST per invocation.)
 *   - Errors during export are swallowed and console.error'd so a flaky
 *     PostHog never breaks a cron.
 *
 * Best-practice fit (per posthog.com/docs/logs/best-practices):
 *   - Emit ONE wide event at the end of each invocation summarizing the
 *     work done. Per-user / per-iteration errors get their own ERROR-level
 *     log lines.
 *   - Always include `service.name` as a resource attribute and any
 *     stable run-level context (timestamp, function version) on each log.
 *
 * Required env (Supabase secrets):
 *   - POSTHOG_PROJECT_TOKEN  (the same `phc_...` key used for events)
 *
 * Optional env:
 *   - POSTHOG_HOST  (defaults to "https://us.i.posthog.com"; set for EU)
 *   - DEPLOYMENT_ENVIRONMENT  (e.g. "production"; defaults to "production")
 */

const DEFAULT_HOST = "https://us.i.posthog.com";

type Severity = "INFO" | "WARN" | "ERROR" | "DEBUG";

const SEVERITY_NUMBERS: Record<Severity, number> = {
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
};

interface OTLPAttribute {
  key: string;
  value:
    | { stringValue: string }
    | { intValue: string }
    | { doubleValue: number }
    | { boolValue: boolean };
}

interface OTLPLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: Severity;
  body: { stringValue: string };
  attributes: OTLPAttribute[];
}

export interface PostHogLogger {
  info(event: string, attrs?: Record<string, unknown>): void;
  warn(event: string, attrs?: Record<string, unknown>): void;
  error(event: string, attrs?: Record<string, unknown>): void;
  debug(event: string, attrs?: Record<string, unknown>): void;
  /** POSTs the buffered records as a single OTLP/HTTP batch. Idempotent. */
  flush(): Promise<void>;
  /** Whether log export is configured (env vars present). Useful for
   *  conditional dispatch logging without forcing every caller to wrap. */
  readonly enabled: boolean;
}

interface CreateOpts {
  /** Logical service name. Lands as `service.name` resource attribute. */
  service: string;
  /** Stable per-invocation context — added to every record this logger emits. */
  attrs?: Record<string, unknown>;
}

/**
 * Coerce a JS value to an OTLP attribute value. Booleans stay booleans;
 * finite integers fit `intValue`; other numbers go to `doubleValue`;
 * everything else is JSON-serialized to a string.
 *
 * Per best-practices: we ONLY accept scalars at the public API boundary
 * (see `attrsToOTLP`). This helper is the value-side of that contract.
 */
function toAttrValue(v: unknown): OTLPAttribute["value"] {
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number") {
    if (Number.isInteger(v) && Number.isSafeInteger(v)) {
      return { intValue: String(v) };
    }
    return { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (v === null || v === undefined) return { stringValue: "" };
  // Catchall — JSON-stringify rather than throw, so a misuse doesn't
  // break the caller. The "context bloat" warning in best-practices
  // applies — try to keep callers passing scalars.
  try {
    return { stringValue: JSON.stringify(v) };
  } catch {
    return { stringValue: String(v) };
  }
}

function attrsToOTLP(
  attrs: Record<string, unknown> | undefined,
): OTLPAttribute[] {
  if (!attrs) return [];
  return Object.entries(attrs).map(([key, value]) => ({
    key,
    value: toAttrValue(value),
  }));
}

function nowUnixNano(): string {
  // Date.now() is ms; OTLP wants ns. Multiplying via BigInt avoids float drift.
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

export function createPostHogLogger(opts: CreateOpts): PostHogLogger {
  const token = Deno.env.get("POSTHOG_PROJECT_TOKEN");
  const host = (Deno.env.get("POSTHOG_HOST") ?? DEFAULT_HOST).replace(/\/$/, "");
  const env = Deno.env.get("DEPLOYMENT_ENVIRONMENT") ?? "production";

  const enabled = !!token;
  const buffer: OTLPLogRecord[] = [];
  const baseAttrs = opts.attrs ?? {};

  function record(severity: Severity, event: string, attrs?: Record<string, unknown>): void {
    if (!enabled) return;
    const ts = nowUnixNano();
    buffer.push({
      timeUnixNano: ts,
      observedTimeUnixNano: ts,
      severityNumber: SEVERITY_NUMBERS[severity],
      severityText: severity,
      body: { stringValue: event },
      attributes: attrsToOTLP({ ...baseAttrs, ...attrs }),
    });
  }

  return {
    enabled,
    info: (event, attrs) => record("INFO", event, attrs),
    warn: (event, attrs) => record("WARN", event, attrs),
    error: (event, attrs) => record("ERROR", event, attrs),
    debug: (event, attrs) => record("DEBUG", event, attrs),
    async flush() {
      if (!enabled || buffer.length === 0) return;
      const records = buffer.splice(0, buffer.length); // empty the buffer
      const payload = {
        resourceLogs: [
          {
            resource: {
              attributes: attrsToOTLP({
                "service.name": opts.service,
                "deployment.environment": env,
              }),
            },
            scopeLogs: [
              {
                scope: { name: opts.service },
                logRecords: records,
              },
            ],
          },
        ],
      };

      try {
        const res = await fetch(`${host}/i/v1/logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(
            `posthog-logs export failed (${res.status}): ${text.slice(0, 200)}`,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("posthog-logs export error:", message);
      }
    },
  };
}
