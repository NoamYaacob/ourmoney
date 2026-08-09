import { Redirect } from 'expo-router'

// No session exists yet (Milestone 3 adds real auth). Every cold start
// currently lands on sign-in; this becomes conditional on session presence
// once one exists.
export default function Index() {
  return <Redirect href="/sign-in" />
}
