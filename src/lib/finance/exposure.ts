// Platform exposure (2.6): accepted obligations survive refunds; exposure is explicit.
// exposure = accepted supplier obligations + pending buyer refunds − captured funds.
export interface ExposureInput { acceptedObligationsMinor: number; pendingRefundsMinor: number; capturedUsdMinor: number; fxEgpPerUsd: number; }
export interface Exposure { acceptedObligationsMinor: number; pendingRefundsMinor: number; capturedEgpMinor: number; netExposureMinor: number; }

export function platformExposure(i: ExposureInput): Exposure {
  const capturedEgpMinor = Math.round((i.capturedUsdMinor / 100) * i.fxEgpPerUsd * 100);
  return {
    acceptedObligationsMinor: i.acceptedObligationsMinor,
    pendingRefundsMinor: i.pendingRefundsMinor,
    capturedEgpMinor,
    netExposureMinor: i.acceptedObligationsMinor + i.pendingRefundsMinor - capturedEgpMinor,
  };
}
