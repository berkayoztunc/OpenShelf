/** Where to go after login: only an in-app absolute path ("/oauth/authorize?x=1"), never another origin or a protocol-relative URL. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 2000) return "/";
  let v = raw;
  try { v = decodeURIComponent(raw); } catch { return "/"; }
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /^\/[a-z][a-z0-9+.-]*:/i.test(v) || /[\u0000-\u001f]/.test(v)) return "/";
  return raw;
}
