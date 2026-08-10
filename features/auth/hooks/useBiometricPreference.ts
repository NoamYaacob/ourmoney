// Thin TanStack-Query wrapper over ../lib/biometricPreference.ts, same
// shape as features/household/hooks/usePendingInvitationToken.ts.
//
// `enabled` reads `true` (fail-closed) both before the query has resolved
// and after it resolves to the stored default — useBiometricGuard.ts must
// never treat "still loading" as "disabled."

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  biometricPreferenceQueryKey,
  readBiometricPreference,
  writeBiometricPreference,
} from '../lib/biometricPreference'

export function useBiometricPreference() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: biometricPreferenceQueryKey,
    queryFn: readBiometricPreference,
    staleTime: Infinity,
  })

  const mutation = useMutation({
    mutationFn: writeBiometricPreference,
    onSuccess: (_result, enabled) => {
      queryClient.setQueryData(biometricPreferenceQueryKey, enabled)
    },
  })

  return {
    enabled: query.data ?? true,
    isLoading: query.isPending,
    setEnabled: mutation.mutate,
  }
}
