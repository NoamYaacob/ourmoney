import { Stack } from 'expo-router'

// A full tab bar (Dashboard/Transactions/Budgets/Settings) is Milestone 5.
// Milestone 1 has exactly one screen here — a Stack is the honest container.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
