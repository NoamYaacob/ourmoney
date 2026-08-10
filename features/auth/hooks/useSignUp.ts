import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface SignUpInput {
  email: string
  password: string
  displayName: string
}

export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password, displayName }: SignUpInput) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      })
      if (error) throw error
      return data
    },
  })
}
