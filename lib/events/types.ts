// Full domain event vocabulary, declared from day one — including events with
// no subscriber yet. Naming them now is the point; each costs one type.
// See ARCHITECTURE.md § Domain events, ADR-013, ADR-014.

export type EventType =
  | 'transaction.created'
  | 'transaction.updated'
  | 'transaction.categorized'
  | 'budget.threshold_reached'
  | 'budget.exceeded'
  | 'goal.progress_updated'
  | 'goal.completed'
  | 'household.member_joined'
  | 'income.received'
  | 'recurring_payment.detected'
  | 'subscription.detected'
  | 'bank.connected'
  | 'bank.connection_expiring'
  | 'loan.rate_opportunity_detected'
  | 'mortgage.refinance_opportunity_detected'

export interface TransactionCreatedPayload {
  transactionId: string
  accountId: string
  categoryId: string | null
  amountAgorot: number
  isShared: boolean
}

export interface TransactionUpdatedPayload {
  transactionId: string
  changedFields: string[]
}

export interface TransactionCategorizedPayload {
  transactionId: string
  categoryId: string
  previousCategoryId: string | null
}

export interface BudgetThresholdReachedPayload {
  budgetId: string
  categoryId: string
  thresholdPercent: number
  spentAgorot: number
  allocatedAgorot: number
}

export interface BudgetExceededPayload {
  budgetId: string
  categoryId: string
  spentAgorot: number
  allocatedAgorot: number
}

export interface GoalProgressUpdatedPayload {
  goalId: string
  currentAgorot: number
  targetAgorot: number
}

export interface GoalCompletedPayload {
  goalId: string
}

export interface HouseholdMemberJoinedPayload {
  memberId: string
  invitationId: string | null
}

// Events below have no subscriber in MVP-1 — declared now per ADR-013.

export interface IncomeReceivedPayload {
  transactionId: string
  amountAgorot: number
}

export interface RecurringPaymentDetectedPayload {
  templateDescription: string
  amountAgorot: number
  cadenceDays: number
}

export interface SubscriptionDetectedPayload {
  merchantName: string
  amountAgorot: number
}

export interface BankConnectedPayload {
  connectionId: string
  providerId: string
}

export interface BankConnectionExpiringPayload {
  connectionId: string
  expiresAt: string
}

export interface LoanRateOpportunityDetectedPayload {
  loanId: string
  currentRateBps: number
  benchmarkRateBps: number
}

export interface MortgageRefinanceOpportunityDetectedPayload {
  mortgageId: string
  estimatedSavingsAgorot: number
}

export interface EventPayloadMap {
  'transaction.created': TransactionCreatedPayload
  'transaction.updated': TransactionUpdatedPayload
  'transaction.categorized': TransactionCategorizedPayload
  'budget.threshold_reached': BudgetThresholdReachedPayload
  'budget.exceeded': BudgetExceededPayload
  'goal.progress_updated': GoalProgressUpdatedPayload
  'goal.completed': GoalCompletedPayload
  'household.member_joined': HouseholdMemberJoinedPayload
  'income.received': IncomeReceivedPayload
  'recurring_payment.detected': RecurringPaymentDetectedPayload
  'subscription.detected': SubscriptionDetectedPayload
  'bank.connected': BankConnectedPayload
  'bank.connection_expiring': BankConnectionExpiringPayload
  'loan.rate_opportunity_detected': LoanRateOpportunityDetectedPayload
  'mortgage.refinance_opportunity_detected': MortgageRefinanceOpportunityDetectedPayload
}

export type PayloadFor<T extends EventType> = EventPayloadMap[T]

// householdId scopes every event to a household — see ADR-006. actorId is
// null for system-generated events (e.g. a future recurring-payment detector).
export interface DomainEvent<T extends EventType, P> {
  type: T
  householdId: string
  actorId: string | null
  occurredAt: string
  payload: P
}
