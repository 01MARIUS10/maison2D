import { defineStore } from 'pinia'
import type { Opening, Room, Wall } from '../types'

interface StructureState {
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
}

export const useStructureStore = defineStore('atelier-structure', {
  state: (): StructureState => ({
    walls: [],
    openings: [],
    rooms: [],
  }),
  actions: {
    // Actions à implémenter : addWall, addOpening, recomputeRooms...
  },
})
