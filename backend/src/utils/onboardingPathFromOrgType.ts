/** Frontend route segment under /onBoarding/:segment/:token from organizations.organizationType */
export function onboardingPathSegmentFromOrgType(
  orgType: string | null | undefined,
): "buyerOnboarding" | "vendorOnboarding" {
  return String(orgType ?? "")
    .trim()
    .toLowerCase() === "buyer"
    ? "buyerOnboarding"
    : "vendorOnboarding";
}
