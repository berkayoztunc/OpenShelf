/**
 * Secret fields are write-only. Per key the UI is in one of three modes:
 *  keep  -> omit from payload (server keeps stored value)
 *  set   -> send typed value
 *  clear -> send null (server clears)
 */
export type SecretMode = "keep" | "set" | "clear";
export interface SecretState { mode: SecretMode; value: string }

export function buildSecretsPayload(state: Record<string, SecretState>): Record<string, string | null> | undefined {
  const out: Record<string, string | null> = {};
  for (const [k, s] of Object.entries(state)) {
    if (s.mode === "clear") out[k] = null;
    else if (s.mode === "set" && s.value.trim() !== "") out[k] = s.value;
  }
  return Object.keys(out).length ? out : undefined;
}
