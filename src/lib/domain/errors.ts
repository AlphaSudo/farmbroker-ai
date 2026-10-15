// Canonical domain error classes (2.0). Routes map code → HTTP; never leak internals.
export type ErrorCode =
  | "NOT_FEASIBLE" | "OVER_BUDGET" | "STALE_SNAPSHOT" | "VERSION_CONFLICT"
  | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "EXPIRED" | "CONFLICT"
  | "PROVIDER_BLOCKED" | "PROVIDER_ERROR" | "VALIDATION" | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  NOT_FEASIBLE: 422, OVER_BUDGET: 422, STALE_SNAPSHOT: 409, VERSION_CONFLICT: 409,
  UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, EXPIRED: 410, CONFLICT: 409,
  PROVIDER_BLOCKED: 503, PROVIDER_ERROR: 502, VALIDATION: 400, INTERNAL: 500,
};

export class DomainError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
  get status(): number { return STATUS[this.code] ?? 500; }
}

export const httpStatus = (e: unknown): number => {
  if (e instanceof DomainError) return e.status;
  const s = (e as { status?: number })?.status;
  return typeof s === "number" ? s : 500;
};
