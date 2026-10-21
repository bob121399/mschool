/** Only a local pathname: one leading "/", no "//", no backslashes, no control chars (spec 5.3).
 * An absolute URL is accepted only when its origin equals APP_ORIGIN (Supabase RedirectTo). */
export function safeNext(value: string | null | undefined, fallback = "/login", appOrigin?: string): string {
  if (!value) return fallback;
  let candidate = value.trim();
  if (appOrigin && /^https?:\/\//iu.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (url.origin !== new URL(appOrigin).origin) return fallback;
      candidate = url.pathname + url.search;
    } catch {
      return fallback;
    }
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/u.test(candidate)) return fallback;
  if (/^\/[^/]*:/u.test(candidate)) return fallback;
  try {
    const decoded = decodeURIComponent(candidate);
    if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  } catch {
    return fallback;
  }
  return candidate;
}
