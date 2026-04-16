import { getApiBaseUrl } from "./apiBaseUrl"

export type OnboardingAccessStatusResult =
  | { ok: true; onboardingCompleted: boolean }
  | { ok: false; reason: "unauthorized" | "not_found" | "network" | "unknown" }

/** Uses onboarding JWT (invite link) to check if user has already completed onboarding. */
export async function fetchOnboardingAccessStatus(
  onboardingToken: string,
): Promise<OnboardingAccessStatusResult> {
  const BASE_URL = getApiBaseUrl()
  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/onboarding/access-status`, {
      headers: { Authorization: `Bearer ${onboardingToken}` },
    })
    if (res.status === 401) return { ok: false, reason: "unauthorized" }
    if (res.status === 404) return { ok: false, reason: "not_found" }
    if (!res.ok) return { ok: false, reason: "unknown" }
    const data = (await res.json()) as { onboardingCompleted?: boolean }
    return { ok: true, onboardingCompleted: Boolean(data.onboardingCompleted) }
  } catch {
    return { ok: false, reason: "network" }
  }
}
