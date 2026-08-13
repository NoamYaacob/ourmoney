// Settings' display-name edit affordance (PROJECT_SPEC.md § Settings:
// "Profile (display name, avatar)" — avatar upload is explicitly out of
// scope here; it needs Supabase Storage infrastructure that does not exist
// yet). Plain UPDATE — profiles_update's RLS policy is `id = auth.uid()`,
// so a user can only ever update their own row; no client-side check adds
// anything RLS doesn't already guarantee.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { profileQueryKey } from './useProfile'

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (displayName: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', userId as string)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
    },
  })
}
