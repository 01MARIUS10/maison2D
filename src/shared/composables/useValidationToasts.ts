import { onBeforeUnmount, watch, type Ref } from 'vue'
import { useToasts, type ToastVariant } from './useToasts'

/**
 * Transforme une liste de messages de validation (calculée à partir de l'état) en toasts.
 *
 * Un message ne déclenche un toast qu'au moment où il APPARAÎT : tant qu'il persiste (même après la
 * fermeture ou l'expiration du toast) il ne réapparaît pas à chaque modification du plan. S'il disparaît
 * (le problème est corrigé), son toast est retiré ; s'il revient plus tard, un nouveau toast s'affiche.
 * Les toasts restants sont retirés quand le composant est démonté (ex: changement d'étape).
 */
export function useValidationToasts(messages: Readonly<Ref<string[]>>, variant: ToastVariant = 'warning') {
  const { push, dismiss } = useToasts()
  const active = new Map<string, number>() // message -> id du toast

  watch(
    messages,
    (current) => {
      const now = new Set(current)
      for (const [message, id] of active) {
        if (!now.has(message)) {
          dismiss(id)
          active.delete(message)
        }
      }
      for (const message of now) {
        if (!active.has(message)) active.set(message, push(message, { variant }))
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    for (const id of active.values()) dismiss(id)
    active.clear()
  })
}
