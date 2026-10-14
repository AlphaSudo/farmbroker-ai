// Tagged minor-unit money (1.1/1.5). Legacy EGP decimals remain on deals; new
// contracts/ledger/refunds store integer minor units + currency + FX snapshot.
export const FX_SNAPSHOT = { egpPerUsd: 48, asOf: "2026-10-14", source: "demo-fixed", note: "Sandbox has no EGP; USD charge disclosed next to EGP total." } as const;

export interface Money { minor: number; currency: "EGP" | "USD"; }
export const egp = (minor: number): Money => ({ minor: Math.round(minor), currency: "EGP" });
export const usd = (minor: number): Money => ({ minor: Math.round(minor), currency: "USD" });
export const egpMajorToMinor = (major: number): number => {
  if (!Number.isFinite(major) || major < 0) throw new Error("Invalid EGP amount");
  return Math.round(major * 100);
};
export const egpToUsdMinor = (egpMinor: number): number => {
  if (!Number.isFinite(egpMinor) || egpMinor < 0) throw new Error("Invalid amount");
  return Math.round((egpMinor / FX_SNAPSHOT.egpPerUsd / 100) * 100);
};
export const fmtMinor = (m: Money): string => `${(m.minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m.currency}`;
