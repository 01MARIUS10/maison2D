<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

export type ExportFormat = 'png' | 'pdf' | 'json'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ export: [format: ExportFormat] }>()

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'png', label: 'Image (PNG)', hint: 'Le plan complet, haute définition' },
  { id: 'pdf', label: 'Document (PDF)', hint: 'Une page A4 paysage, prête à imprimer' },
  { id: 'json', label: 'Données (JSON)', hint: 'Toutes les données du plan' },
]

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function choose(format: ExportFormat) {
  open.value = false
  emit('export', format)
}

// Ferme le menu au clic à l'extérieur ou sur Échap.
function onDocumentPointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeyDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :disabled="disabled"
      class="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      @click="open = !open"
    >
      Exporter
      <span aria-hidden="true" class="text-xs">▾</span>
    </button>

    <!-- Le menu s'ouvre vers le bas : le bouton est dans l'en-tête, en haut de page. -->
    <ul
      v-if="open"
      role="menu"
      class="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <li v-for="format in FORMATS" :key="format.id" role="none">
        <button
          type="button"
          role="menuitem"
          class="block w-full px-4 py-2.5 text-left hover:bg-gray-50"
          @click="choose(format.id)"
        >
          <span class="block text-sm font-medium text-gray-900">{{ format.label }}</span>
          <span class="block text-xs text-gray-500">{{ format.hint }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
