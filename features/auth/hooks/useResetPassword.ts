// Completes the forgot-password flow (app/reset-password.tsx). Requires the
// recovery session Supabase establishes client-side when the
// ourmoney://reset-password deep link is opened — supabase.auth.updateUser
// operates on that session, not a token passed explicitly.

import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function useResetPassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    },
  })
}
