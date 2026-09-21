import { defineStore } from 'pinia'
import type { Finish, FurnitureItem, TechnicalSymbol } from '../types'

interface SecondOeuvreState {
  furniture: FurnitureItem[]
  technicalSymbols: TechnicalSymbol[]
  finishes: Finish[]
}

export const useSecondOeuvreStore = defineStore('atelier-second-oeuvre', {
  state: (): SecondOeuvreState => ({
    furniture: [],
    technicalSymbols: [],
    finishes: [],
  }),
  actions: {
    // Actions à implémenter : addFurniture, addTechnicalSymbol, setFinish...
  },
})
