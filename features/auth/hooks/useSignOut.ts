import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  })
}
