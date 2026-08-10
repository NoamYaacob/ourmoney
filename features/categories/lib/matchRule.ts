// Pure rule-matching logic — the single implementation shared by
// transaction-creation-time auto-categorization and the retroactive
// rule-application hook (one implementation, two call sites), per
// ADR-027's requirement that every rule be visible/editable/explainable.

import type { CategoryRule } from '@/types/app'

function normalize(value: string, isCaseSensitive: boolean): string {
  return isCaseSensitive ? value : value.toLowerCase()
}

export function matchesRule(
  rule: Pick<CategoryRule, 'field' | 'operator' | 'value' | 'is_case_sensitive'>,
  transaction: { description: string; merchant_name: string | null }
): boolean {
  const fieldValue = rule.field === 'description' ? transaction.description : (transaction.merchant_name ?? '')
  if (!fieldValue) return false

  const haystack = normalize(fieldValue, rule.is_case_sensitive)
  const needle = normalize(rule.value, rule.is_case_sensitive)
  if (!needle) return false

  switch (rule.operator) {
    case 'contains':
      return haystack.includes(needle)
    case 'equals':
      return haystack === needle
    case 'starts_with':
      return haystack.startsWith(needle)
  }
}

// First matching rule wins, in sort_order — the exact rule that matched is
// what "which rule caused this categorization" (ADR-027) points back to.
export function findMatchingRule<T extends Pick<CategoryRule, 'field' | 'operator' | 'value' | 'is_case_sensitive' | 'sort_order' | 'is_active'>>(
  rules: readonly T[],
  transaction: { description: string; merchant_name: string | null }
): T | null {
  const active = [...rules].filter((rule) => rule.is_active).sort((a, b) => a.sort_order - b.sort_order)
  for (const rule of active) {
    if (matchesRule(rule, transaction)) return rule
  }
  return null
}
