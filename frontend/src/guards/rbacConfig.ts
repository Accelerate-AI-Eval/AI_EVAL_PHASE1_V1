/**
 * RBAC route configuration: allowed base paths per role.
 * Used by RBACGuard and RequireRole for route protection.
 */
export type SystemRole =
  | "system admin"
  | "system manager"
  | "system viewer"
  | "ai directory curator"
  | "vendor"
  | "buyer";

export const ALLOWED_ROUTES: Record<SystemRole, readonly string[]> = {
  "system admin": [
    "/",
    "/dashboard",
    "/organizations",
    "/assessments",
    "/attestation_details",
    "/vendor-directory",
    "/riskMappings",
    "/security_center",
    "/governance",
    "/salesEnablement",
    "/evidence-library",
    "/product_profile",
    "/reports",
    "/userManagement",
    "/vendorSelfAttestation",
  ],
  "system manager": [
    "/",
    "/account",
    "/dashboard",
    "/organizations",
    "/attestation_details",
    "/vendor-directory",
    "/assessments",
    "/vendorcots",
    "/buyerAssessment",
    "/riskMappings",
    "/product_profile",
    "/reports",
    "/userManagement",
    "/vendorSelfAttestation",
  ],
  "system viewer": [
    "/",
    "/account",
    "/dashboard",
    "/organizations",
    "/attestation_details",
    "/vendor-directory",
    "/assessments",
    "/vendorcots",
    "/buyerAssessment",
    "/riskMappings",
    "/product_profile",
    "/reports",
    "/userManagement",
    "/vendorSelfAttestation",
  ],
  "ai directory curator": [
    "/",
    "/account",
    "/dashboard",
    "/attestation_details",
    "/vendor-directory",
    "/vendorSelfAttestation",
  ],
  vendor: [
    "/",
    "/account",
    "/dashboard",
    "/assessments",
    "/vendorcots",
    "/riskMappings",
    "/salesEnablement",
    "/evidence-library",
    "/reports",
    "/product_profile",
    "/userManagement",
    "/attestation_details",
    "/vendorSelfAttestation",
  ],
  buyer: [
    "/",
    "/account",
    "/dashboard",
    "/assessments",
    "/buyerAssessment",
    "/vendor-directory",
    "/riskMappings",
    "/security_center",
    "/governance",
    "/reports",
    "/userManagement",
  ],
};

const ROLE_ALIASES: Record<string, SystemRole> = {
  system_admin: "system admin",
  system_manager: "system manager",
  system_viewer: "system viewer",
  ai_directory_curator: "ai directory curator",
};

/**
 * Paths that require specific user roles when user has vendor or buyer system role.
 * e.g. vendor/buyer "lead" cannot access User Management; only "admin" and "manager" can.
 */
export const PATH_USER_ROLE_RESTRICTIONS: Record<
  string,
  { forSystemRoles: SystemRole[]; allowedUserRoles: string[] }
> = {
  "/userManagement": {
    forSystemRoles: ["vendor", "buyer"],
    allowedUserRoles: ["admin", "manager"],
  },
};

/**
 * Vendor user roles with view-only access on the attestation page only.
 * Engineer and Viewer (vendor side): keep access to all other vendor pages as before;
 * on the attestation page they can only view (no edit, no add). They cannot access the
 * attestation form route (/vendorSelfAttestation). Includes both stored values and display forms.
 */
export const VENDOR_ATTESTATION_VIEW_ONLY_USER_ROLES = [
  "engineer",
  "viewer",
  "t&sa engineer",
  "t&sa viewer",
];

/** @deprecated Use VENDOR_ATTESTATION_VIEW_ONLY_USER_ROLES; kept for backward compatibility. */
export const VENDOR_ATTESTATION_ONLY_USER_ROLES = VENDOR_ATTESTATION_VIEW_ONLY_USER_ROLES;

export function isVendorAttestationOnlyRole(userRole: string | null | undefined): boolean {
  const normalized = normalizeUserRole(userRole);
  if (!normalized) return false;
  const normalizedSpaces = normalized.replace(/\s+/g, " ").trim();
  const normalizedUnderscores = normalized.replace(/_/g, " ");
  return VENDOR_ATTESTATION_VIEW_ONLY_USER_ROLES.some(
    (r) =>
      r === normalized ||
      r === normalizedSpaces ||
      r === normalizedUnderscores ||
      r.replace(/\s+/g, " ").trim() === normalizedSpaces
  );
}

/** Block attestation form path for vendor Engineer/Viewer (they can view list on attestation_details but cannot open create/edit form). */
function isAttestationFormPath(path: string): boolean {
  return path === "/vendorSelfAttestation" || path.startsWith("/vendorSelfAttestation/");
}

export function normalizeSystemRole(role: string | null | undefined): SystemRole | "" {
  if (!role) return "";
  const normalized = role.toLowerCase().trim();
  return (ROLE_ALIASES[normalized] as SystemRole) ?? (normalized as SystemRole) ?? "";
}

export function normalizeUserRole(role: string | null | undefined): string {
  if (!role) return "";
  return role.toLowerCase().trim();
}

/**
 * Returns whether the given path is allowed for the given (normalized) system role.
 */
export function isPathAllowedForRole(path: string, normalizedRole: SystemRole | ""): boolean {
  if (!normalizedRole) return false;
  const routesForRole = ALLOWED_ROUTES[normalizedRole] ?? [];

  // System admin has access to all pages
  if (normalizedRole === "system admin") return true;

  if (routesForRole.includes(path)) return true;

  // Dynamic segment rules
  if (path.startsWith("/buyer-vendor-risk-report/") && routesForRole.includes("/buyerAssessment"))
    return true;
  if (path.startsWith("/organizations/") && routesForRole.includes("/organizations")) return true;
  if (path.startsWith("/reports/") && path.length > "/reports/".length) return true;
  if (path.startsWith("/vendor-directory/") && routesForRole.includes("/vendor-directory")) return true;
  if (normalizedRole === "vendor" && path.startsWith("/vendorSelfAttestation/")) return true;
  if (normalizedRole === "vendor" && path.startsWith("/vendorcots/")) return true;
  if (normalizedRole === "buyer" && path.startsWith("/buyerAssessment/")) return true;
  if (
    (normalizedRole === "system manager" || normalizedRole === "system viewer") &&
    (path.startsWith("/vendorcots") || path.startsWith("/buyerAssessment") || path.startsWith("/reports/"))
  )
    return true;
  if (normalizedRole === "ai directory curator" && path.startsWith("/vendorSelfAttestation")) return true;

  return false;
}

/** Buyer Viewer: view-only access limited to Dashboard, AI Vendor Directory, and Reports. */
const BUYER_VIEWER_ALLOWED_PATHS = [
  "/",
  "/account",
  "/dashboard",
  "/vendor-directory",
  "/reports",
];

function isPathAllowedForBuyerViewer(path: string): boolean {
  if (BUYER_VIEWER_ALLOWED_PATHS.includes(path)) return true;
  if (path.startsWith("/reports/") && path.length > "/reports/".length) return true;
  return false;
}

/**
 * Returns whether the path is allowed for this system role and user role.
 * - Vendor Engineer and Viewer: keep all previous vendor pages; only the attestation form
 *   (/vendorSelfAttestation) is blocked so they cannot add or edit attestations. On the
 *   attestation details page they get view-only UI (handled in VendorAttestationDetails).
 * - Buyer Viewer: view-only for Dashboard, AI Vendor Directory, and Reports only (no Assessments, Risk Mapping, User Management).
 * - For paths in PATH_USER_ROLE_RESTRICTIONS (e.g. /userManagement), user must be in the allowed list.
 */
export function isPathAllowedForUserRole(
  path: string,
  normalizedSystemRole: SystemRole | "",
  userRole: string
): boolean {
  const normalizedUser = normalizeUserRole(userRole);

  // Buyer Viewer: only Dashboard, AI Vendor Directory, and Reports (view-only)
  if (normalizedSystemRole === "buyer" && normalizedUser === "viewer") {
    return isPathAllowedForBuyerViewer(path);
  }

  // Vendor Engineer / Viewer: block only the attestation form route; allow all other vendor paths
  if (
    normalizedSystemRole === "vendor" &&
    isVendorAttestationOnlyRole(userRole) &&
    isAttestationFormPath(path)
  ) {
    return false;
  }

  if (!isPathAllowedForRole(path, normalizedSystemRole)) return false;

  const restriction = PATH_USER_ROLE_RESTRICTIONS[path];
  if (!restriction) return true;

  const applies = restriction.forSystemRoles.includes(normalizedSystemRole as SystemRole);
  if (!applies) return true;

  return restriction.allowedUserRoles.some(
    (r) => r.toLowerCase().trim() === normalizedUser
  );
}
