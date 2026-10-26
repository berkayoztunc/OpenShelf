const SENSITIVE = /(secret|password|passwd|token|totp|authorization|cookie|api[_-]?key|apikey|signature|card|cvv|iban|identity)/i;
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 500) return value.slice(0, 500) + "…";
  return value;
}
export function log(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ...(meta ? { meta: redact(meta) } : {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
/** Strip known secret values from free-text error messages. */
export function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("***");
  return out.slice(0, 500);
}
