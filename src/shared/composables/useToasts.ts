import { readonly, ref } from 'vue'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

const DEFAULT_DURATION_MS = 8000

// État partagé au niveau du module : un seul empilement de toasts pour toute l'application,
// affiché par `ToastContainer` (monté une fois dans App.vue).
const toasts = ref<Toast[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

function dismiss(id: number) {
  const timer = timers.get(id)
  if (timer !== undefined) clearTimeout(timer)
  timers.delete(id)
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

/** Affiche un toast et renvoie son identifiant. `durationMs: 0` le rend persistant jusqu'à fermeture. */
function push(message: string, options: { variant?: ToastVariant; durationMs?: number } = {}): number {
  const id = nextId++
  toasts.value = [...toasts.value, { id, message, variant: options.variant ?? 'info' }]

  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS
  if (durationMs > 0) timers.set(id, setTimeout(() => dismiss(id), durationMs))
  return id
}

export function useToasts() {
  return { toasts: readonly(toasts), push, dismiss }
}
