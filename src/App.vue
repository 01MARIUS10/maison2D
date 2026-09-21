<script setup lang="ts">
import AppHeader from '@/shared/components/AppHeader.vue'
import ToastContainer from '@/shared/components/ToastContainer.vue'
</script>

<template>
  <AppHeader />
  <RouterView />
  <ToastContainer />
</template>
