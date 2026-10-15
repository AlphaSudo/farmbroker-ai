// Recovery policy v2 (2.6): versioned authority for repair inside the accepted contract.
// Buyer charge never changes; replacement spend is bounded by remaining authority.
export const RECOVERY_POLICY = "v2";
export const MAX_RECOVERY_ATTEMPTS = 3;
export const RESERVE_EGP_MINOR = 0; // no unsupported capital assumed

export interface Authority { marginMinor: number; spentMinor: number; remainingMinor: number; }

// remaining = quoted margin pool minus already-reserved recovery spend
export function remainingAuthority(marginMinor: number, spentMinor: number): Authority {
  const remainingMinor = marginMinor * 1 - spentMinor - RESERVE_EGP_MINOR;
  return { marginMinor, spentMinor, remainingMinor };
}
