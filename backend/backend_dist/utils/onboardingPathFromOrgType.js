/** Frontend route segment under /onBoarding/:segment/:token from organizations.organizationType */
export function onboardingPathSegmentFromOrgType(orgType) {
    return String(orgType ?? "")
        .trim()
        .toLowerCase() === "buyer"
        ? "buyerOnboarding"
        : "vendorOnboarding";
}
