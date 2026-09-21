import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import * as authService from '../services/auth.service'
import type { LoginCredentials, RegisterPayload, User } from '../types'

interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
  initialized: boolean
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isLoading: false,
    error: null,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
  },
  actions: {
    /** À appeler une fois au démarrage de l'application. */
    async initialize() {
      if (this.initialized) return
      this.user = await authService.getCurrentUser()
      this.initialized = true

      supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          this.user = null
          return
        }
        void authService.getCurrentUser().then((user) => {
          this.user = user
        })
      })
    },

    async login(credentials: LoginCredentials) {
      this.isLoading = true
      this.error = null
      try {
        this.user = await authService.login(credentials)
      } catch (err) {
        this.error = errorMessage(err, 'Identifiants invalides.')
        throw err
      } finally {
        this.isLoading = false
      }
    },

    /** Retourne true si un e-mail de confirmation a été envoyé (pas encore de session). */
    async register(payload: RegisterPayload): Promise<{ needsEmailConfirmation: boolean }> {
      this.isLoading = true
      this.error = null
      try {
        const result = await authService.register(payload)
        this.user = result.user
        return { needsEmailConfirmation: result.needsEmailConfirmation }
      } catch (err) {
        this.error = errorMessage(err, "Erreur lors de l'inscription.")
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      await authService.logout()
      this.user = null
    },
  },
})
