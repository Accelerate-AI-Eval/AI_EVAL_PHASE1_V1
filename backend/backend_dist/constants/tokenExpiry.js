/**
 * Token expiry for invite/signup and onboarding links.
 * Keep in sync with jwt.sign(..., { expiresIn }) where these links are created.
 */
/** Signup (invite) link: how long the user has to complete signup after invite. Used in user.ts. */
export const SIGNUP_LINK_EXPIRY_DAYS = 7;
export const SIGNUP_LINK_EXPIRY_JWT = "7d";
/** Onboarding link: how long the admin has to complete org onboarding after signup. Used in signup.ts. */
export const ONBOARDING_LINK_EXPIRY_DAYS = 1;
export const ONBOARDING_LINK_EXPIRY_JWT = "1d";
