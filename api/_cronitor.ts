// Cronitor telemetry ping helper for Slate. Mirrors Scout's helper.
// Never throws — a failed ping must not break the caller.

const TELEMETRY_KEY = process.env.CRONITOR_TELEMETRY_KEY;

type PingState = "run" | "complete" | "fail";

export async function pingCronitor(
  monitorKey: string,
  state: PingState = "complete",
  opts?: { message?: string; metrics?: Record<string, number> }
): Promise<void> {
  if (!TELEMETRY_KEY) return;

  const params = new URLSearchParams({ state });
  if (opts?.message) params.set("message", opts.message.slice(0, 1000));
  if (opts?.metrics) {
    for (const [k, v] of Object.entries(opts.metrics)) {
      params.set(`metric.${k}`, String(v));
    }
  }

  const url = `https://cronitor.link/p/${TELEMETRY_KEY}/${encodeURIComponent(monitorKey)}?${params}`;

  try {
    await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
  } catch (err: any) {
    console.error(`[cronitor] ping failed (${monitorKey}/${state}):`, err?.message || err);
  }
}
