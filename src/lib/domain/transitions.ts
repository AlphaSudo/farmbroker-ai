// Legal transaction transitions + expected-version guard (1.1).
export const TRANSITIONS: Record<string, string[]> = {
  buyer_requests: ["open>quoted", "quoted>paid", "paid>procuring", "procuring>covered", "procuring>settled", "procuring>short", "covered>settled", "short>settled", "settled>completed"],
  deals: ["quoted>paid", "paid>procuring", "procuring>covered", "procuring>settled", "procuring>short", "covered>settled", "short>settled", "settled>completed"],
};
export function canTransition(table: keyof typeof TRANSITIONS, from: string, to: string): boolean {
  return (TRANSITIONS[table] ?? []).includes(`${from}>${to}`) || from === to;
}
export function assertTransition(table: keyof typeof TRANSITIONS, from: string, to: string): void {
  if (!canTransition(table, from, to)) throw new Error(`Illegal transition ${table}: ${from} → ${to}`);
}
