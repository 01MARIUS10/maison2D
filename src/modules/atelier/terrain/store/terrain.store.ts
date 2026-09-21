import { defineStore } from 'pinia'
import type { Terrain } from '../types'

interface TerrainState {
  terrain: Terrain | null
}

export const useTerrainStore = defineStore('atelier-terrain', {
  state: (): TerrainState => ({
    terrain: null,
  }),
  actions: {
    // Actions à implémenter : setFromGps, setFromManualDrawing, reset...
  },
})
