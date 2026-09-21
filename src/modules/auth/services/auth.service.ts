import { supabase } from '@/lib/supabase'
import type { LoginCredentials, RegisterPayload, User } from '../types'

async function fetchProfile(userId: string): Promise<User> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nom, ville, pays, mail')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

export async function login(credentials: LoginCredentials): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.mail,
    password: credentials.mdp,
  })
  if (error) throw error

  return fetchProfile(data.user.id)
}

export interface RegisterResult {
  user: User | null
  /** true si un e-mail de confirmation doit être validé avant de pouvoir se connecter. */
  needsEmailConfirmation: boolean
}

export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  const { data, error } = await supabase.auth.signUp({
    email: payload.mail,
    password: payload.mdp,
    options: {
      data: {
        nom: payload.nom,
        ville: payload.ville,
        pays: payload.pays,
      },
    },
  })
  if (error) throw error

  if (!data.session || !data.user) {
    return { user: null, needsEmailConfirmation: true }
  }

  return { user: await fetchProfile(data.user.id), needsEmailConfirmation: false }
}

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return null

  return fetchProfile(userId)
}
