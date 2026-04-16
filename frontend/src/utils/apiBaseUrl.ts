/**
 * Single source for API origin + path so fetch URLs match Express `app.use("/api/v1", ...)`.
 * Supports VITE_BASE_URL as either `http://host:port` or `http://host:port/api/v1` (with or without trailing slash).
 */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_BASE_URL ?? "").toString().trim()
  const fallback = "http://localhost:5003/api/v1"
  if (!raw) return fallback
  try {
    const u = new URL(raw)
    const path = (u.pathname || "/").replace(/\/+$/, "")
    if (path === "/api/v1" || path.endsWith("/api/v1")) {
      return `${u.origin}${path}`.replace(/\/+$/, "")
    }
    if (path === "" || path === "/") {
      return `${u.origin}/api/v1`
    }
    return `${u.origin}${path}`.replace(/\/+$/, "")
  } catch {
    return fallback
  }
}
