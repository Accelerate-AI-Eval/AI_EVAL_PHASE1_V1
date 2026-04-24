/**
 * Shared JWT config so login and auth middleware always use the same secret and behaviour.
 * Ensures tokens issued at login validate when verifying.
 */
const JWT_SECRET = typeof process.env.JWT_SECRET_KEY === "string" &&
    process.env.JWT_SECRET_KEY.trim() !== ""
    ? process.env.JWT_SECRET_KEY.trim()
    : "your-secret-key";
const JWT_EXPIRY = "7d";
export function getJwtSecret() {
    return JWT_SECRET;
}
export function getJwtExpiry() {
    return JWT_EXPIRY;
}
