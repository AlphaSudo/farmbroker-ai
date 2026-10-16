// Platform exposure (2.6): accepted obligations survive refunds; exposure is explicit.
// All obligations/exposure are EGP minor units. Provider refund inputs are USD
// cents, converted with the same fixed FX snapshot as the captured contract.
export interface ExposureInput { acceptedObligationsMinor: number; pendingRefundsUsdMinor: number; completedRefundsUsdMinor: number; capturedUsdMinor: number; fxEgpPerUsd: number; }
export interface Exposure {
  acceptedObligationsMinor: number;
  /** Legacy response alias: USD cents. Prefer pendingRefundsUsdMinor. */
  pendingRefundsMinor: number;
  pendingRefundsUsdMinor: number; pendingRefundsEgpMinor: number;
  completedRefundsUsdMinor: number; completedRefundsEgpMinor: number;
  capturedEgpMinor: number; retainedEgpMinor: number; netExposureMinor: number;
}

export function platformExposure(i: ExposureInput): Exposure {
  if (![i.acceptedObligationsMinor, i.pendingRefundsUsdMinor, i.completedRefundsUsdMinor, i.capturedUsdMinor].every(n => Number.isSafeInteger(n) && n >= 0)
    || !Number.isFinite(i.fxEgpPerUsd) || i.fxEgpPerUsd <= 0
    || i.pendingRefundsUsdMinor + i.completedRefundsUsdMinor > i.capturedUsdMinor) throw new Error("Invalid exposure amounts or FX snapshot");
  const toEgp = (usdMinor: number) => Math.round(usdMinor * i.fxEgpPerUsd);
  const capturedEgpMinor = toEgp(i.capturedUsdMinor);
  const pendingRefundsEgpMinor = toEgp(i.pendingRefundsUsdMinor);
  const completedRefundsEgpMinor = toEgp(i.completedRefundsUsdMinor);
  const retainedEgpMinor = toEgp(i.capturedUsdMinor - i.completedRefundsUsdMinor);
  return {
    acceptedObligationsMinor: i.acceptedObligationsMinor,
    pendingRefundsMinor: i.pendingRefundsUsdMinor,
    pendingRefundsUsdMinor: i.pendingRefundsUsdMinor, pendingRefundsEgpMinor,
    completedRefundsUsdMinor: i.completedRefundsUsdMinor, completedRefundsEgpMinor,
    capturedEgpMinor, retainedEgpMinor,
    netExposureMinor: i.acceptedObligationsMinor + pendingRefundsEgpMinor - retainedEgpMinor,
  };
}
