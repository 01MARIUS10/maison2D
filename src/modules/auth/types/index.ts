/**
 * Profil utilisateur persisté (ex: table "profiles" liée à auth.users côté Supabase).
 * Le mot de passe n'y figure jamais : il ne transite que via les identifiants de connexion/inscription.
 */
export interface User {
  id: string
  nom: string
  ville: string
  pays: string
  mail: string
}

export interface LoginCredentials {
  mail: string
  mdp: string
}

export interface RegisterPayload {
  nom: string
  ville: string
  pays: string
  mail: string
  mdp: string
}
