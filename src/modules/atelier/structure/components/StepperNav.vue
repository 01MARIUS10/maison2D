<script setup lang="ts">
import { STRUCTURE_STEPS, type StructureStepId } from '../constants'

defineProps<{ modelValue: StructureStepId }>()
defineEmits<{ 'update:modelValue': [step: StructureStepId] }>()
</script>

<template>
  <nav aria-label="Étapes de la structure" class="grid gap-2 sm:grid-cols-3">
    <button
      v-for="(step, index) in STRUCTURE_STEPS"
      :key="step.id"
      type="button"
      :aria-current="modelValue === step.id ? 'step' : undefined"
      class="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors"
      :class="
        modelValue === step.id
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
      "
      @click="$emit('update:modelValue', step.id)"
    >
      <span
        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        :class="modelValue === step.id ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-600'"
      >
        {{ index + 1 }}
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold">{{ step.title }}</span>
        <span class="block text-xs" :class="modelValue === step.id ? 'text-gray-300' : 'text-gray-500'">
          {{ step.hint }}
        </span>
      </span>
    </button>
  </nav>
</template>
