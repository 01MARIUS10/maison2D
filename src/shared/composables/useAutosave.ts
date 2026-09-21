import { onScopeDispose, watch } from 'vue'

export interface AutosaveOptions {
  /** Valeur qui CHANGE à chaque modification du contenu (ex: le plan sérialisé) : le compte à rebours repart à zéro. */
  changeSignal: () => unknown
  /** Vrai s'il y a des modifications non enregistrées. */
  isDirty: () => boolean
  isSaving: () => boolean
  /** Enregistre. Doit gérer ses erreurs elle-même (message à l'utilisateur) et renvoyer `true` si l'enregistrement a réussi. */
  save: () => Promise<boolean>
  /** Inactivité, en millisecondes, avant l'enregistrement automatique. Par défaut `AUTOSAVE_DELAY_MS` (30 secondes). */
  delayMs?: number
}

export const AUTOSAVE_DELAY_MS = 30_000

/**
 * Enregistrement automatique après une période d'INACTIVITÉ : à chaque modification le compte à rebours repart de
 * zéro, et l'enregistrement part une fois que plus rien n'a changé pendant `delayMs`.
 *
 * - rien n'est enregistré s'il n'y a pas de modification (un enregistrement manuel entre-temps annule l'effet) ;
 * - si un enregistrement est déjà en cours quand le délai expire, on réessaie après un nouveau délai ;
 * - si un enregistrement automatique ÉCHOUE, on ne réessaie pas en boucle : la prochaine tentative aura lieu après la
 *   prochaine modification (ou par le bouton), pour ne pas répéter la même erreur à chaque échéance ;
 * - le compte à rebours est annulé quand le composant est détruit.
 */
export function useAutosave(options: AutosaveOptions) {
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  function arm() {
    cancel()
    if (!options.isDirty()) return
    timer = setTimeout(() => void fire(), delayMs)
  }

  async function fire() {
    timer = undefined
    if (!options.isDirty()) return
    if (options.isSaving()) {
      arm()
      return
    }
    const saved = await options.save()
    // Modifié pendant l'envoi : ces changements-là ne sont pas partis, on repart pour un tour.
    if (saved && options.isDirty()) arm()
  }

  const stop = watch(options.changeSignal, arm)
  onScopeDispose(() => {
    stop()
    cancel()
  })

  return { cancel }
}
