import { pgEnum } from "drizzle-orm/pg-core";
// Enums from SQL (AI_Eval_DB)
export const assessmentStatusEnum = pgEnum("assessment_status", [
    "draft",
    "submitted",
    "expired",
]);
export const assessmentTypeEnum = pgEnum("assessment_type", [
    "custom_ai",
    "cots_buyer",
    "cots_vendor",
    "vendor_self_attestation",
]);
export const organizationTypeEnum = pgEnum("organization_type", [
    "buyer",
    "vendor",
]);
// Legacy enums (for users table / app use)
export const accountStatusEnum = pgEnum("account_status", ["invited", "confirmed", "expired"]);
export const organizationStatusEnum = pgEnum("organizationStatus", [
    "active",
    "inactive",
]);
export const signup = pgEnum("user_signup_completed", [
    "true",
    "false",
]);
export const onboarding = pgEnum("user_onboarding_completed", [
    "true",
    "false",
]);
export const onboardingStatusEnum = pgEnum("onboarding_status", [
    "completed",
    "expired",
    "pending",
]);
