import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'ourmoney://reset-password',
      })
      if (error) throw error
    },
  })
}
