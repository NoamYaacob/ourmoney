// D10: the user always types a positive ILS figure (parsed via
// lib/money/format.ts's agorotFromILS); sign is derived here from the
// transaction's income/expense nature, never typed directly by the user.
export function signedAmountAgorot(positiveAgorot: number, isIncome: boolean): number {
  return isIncome ? positiveAgorot : -positiveAgorot
}
