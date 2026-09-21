<script setup lang="ts">
import { computed } from 'vue'
import { useToasts, type ToastVariant } from '../composables/useToasts'

const { toasts, dismiss } = useToasts()

// On n'affiche que les plus récents : une rafale de messages ne doit pas recouvrir l'écran.
const MAX_VISIBLE = 4
const visible = computed(() => toasts.value.slice(-MAX_VISIBLE))
const hiddenCount = computed(() => Math.max(toasts.value.length - MAX_VISIBLE, 0))

const VARIANT_STYLES: Record<ToastVariant, { box: string; icon: string; symbol: string }> = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', icon: 'text-blue-600', symbol: 'ℹ' },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: 'text-emerald-600', symbol: '✓' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: 'text-amber-600', symbol: '⚠' },
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: 'text-red-600', symbol: '✕' },
}
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in visible"
        :key="toast.id"
        class="pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg"
        :class="VARIANT_STYLES[toast.variant].box"
      >
        <span aria-hidden="true" class="mt-0.5 shrink-0" :class="VARIANT_STYLES[toast.variant].icon">
          {{ VARIANT_STYLES[toast.variant].symbol }}
        </span>
        <p class="min-w-0 flex-1">{{ toast.message }}</p>
        <button
          type="button"
          class="shrink-0 opacity-60 hover:opacity-100"
          aria-label="Fermer la notification"
          @click="dismiss(toast.id)"
        >
          ✕
        </button>
      </div>
    </TransitionGroup>

    <p
      v-if="hiddenCount > 0"
      class="pointer-events-none self-end rounded-full bg-gray-900 px-3 py-1 text-xs text-white shadow"
    >
      + {{ hiddenCount }} autre{{ hiddenCount > 1 ? 's' : '' }} avertissement{{ hiddenCount > 1 ? 's' : '' }}
    </p>
  </div>
</template>
