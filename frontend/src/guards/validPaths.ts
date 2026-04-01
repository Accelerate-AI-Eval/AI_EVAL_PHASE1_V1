/**
 * Paths that exist under the protected app (AuthGuard + MainLayout).
 * Used to distinguish: invalid route → Page Not Found; valid but no permission → Access Denied.
 */
export const VALID_PROTECTED_PATHS: (string | RegExp)[] = [
  "/",
  "/accessDenied",
  "/dashboard",
  "/organizations",
  /^\/organizations\/assessment\/[^/]+$/,
  "/assessments",
  "/vendorcots",
  "/buyerAssessment",
  /^\/buyer-vendor-risk-report\/[^/]+$/,
  "/vendor-directory",
  "/riskMappings",
  "/security_center",
  "/governance",
  "/salesEnablement",
  "/evidence-library",
  "/product_profile",
  "/reports",
  "/attestation_details",
  "/userManagement",
  "/account",
  /^\/vendorcots\/[^/]+$/,
  /^\/buyerAssessment\/[^/]+$/,
  /^\/reports\/general\/[^/]+$/,
  /^\/reports\/[^/]+$/,
];

export function isValidProtectedPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return VALID_PROTECTED_PATHS.some((p) =>
    typeof p === "string" ? normalized === p : p.test(normalized)
  );
}
