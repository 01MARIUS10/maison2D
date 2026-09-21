import { defineStore } from 'pinia'
import type { PlanPoint } from '@/shared/types'
import { useAuthStore } from '@/modules/auth'
import type { Plan } from '../types'
import type { EdgeOpening, HouseBase, Room, RoomOpening, WallType } from '../structure/types'
import type { Gate, Road, Terrain } from '../terrain/types'
import { rotateTerrainVertices, translateTerrainVertices } from '../terrain/services/terrain.service'
import * as planService from '../services/plan.service'
import { serializePlan } from '../services/plan.snapshot'
import { translatePlanContent } from '../services/plan.transform'

/** idle = jamais chargé ; loading = requête en cours ; ready = liste à jour ; error = échec (voir `error`). */
export type PlanLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PlanState {
  plans: Plan[]
  status: PlanLoadStatus
  error: string | null
  /** Compte pour lequel `plans` a été chargée : un autre compte connecté repart d'une liste vide. */
  loadedFor: string | null
  /** Pour chaque plan, son contenu (sérialisé) au dernier chargement ou enregistrement : sert à détecter les modifications. */
  savedSnapshots: Record<string, string>
  /** Plans dont l'enregistrement est en cours. */
  savingIds: string[]
}

// Requête de chargement en cours : les vues appellent `load()` toutes en même temps à leur affichage, une seule
// requête part et tout le monde attend la même. Hors de l'état Pinia : une promesse n'a rien à faire dans l'état.
let pendingLoad: Promise<void> | null = null

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur inconnue.'
}

export const usePlanStore = defineStore('atelier-plan', {
  state: (): PlanState => ({
    plans: [],
    status: 'idle',
    error: null,
    loadedFor: null,
    savedSnapshots: {},
    savingIds: [],
  }),
  getters: {
    getPlanById:
      (state) =>
      (id: string): Plan | null =>
        state.plans.find((plan) => plan.id === id) ?? null,

    /** Vrai si le plan a des modifications non enregistrées (son contenu diffère de celui du dernier enregistrement). */
    isDirty:
      (state) =>
      (id: string): boolean => {
        const plan = state.plans.find((candidate) => candidate.id === id)
        return plan !== undefined && serializePlan(plan) !== state.savedSnapshots[id]
      },

    isSaving:
      (state) =>
      (id: string): boolean =>
        state.savingIds.includes(id),
  },
  actions: {
    /**
     * Charge les ateliers du compte connecté depuis Supabase. Ne refait rien si la liste est déjà à jour pour ce
     * compte (sauf `force`) et ne lance jamais deux requêtes en parallèle. Ne lève pas : l'échec est dans `status`/`error`.
     */
    load(force = false): Promise<void> {
      const userId = useAuthStore().user?.id ?? null

      // Un autre compte s'est connecté : on ne montre surtout pas les ateliers du précédent.
      if (this.loadedFor !== userId) {
        this.plans = []
        this.status = 'idle'
      }
      if (!force && this.status === 'ready') return Promise.resolve()
      if (pendingLoad) return pendingLoad

      this.status = 'loading'
      this.error = null
      pendingLoad = planService
        .fetchPlans()
        .then((plans) => {
          this.plans = plans
          for (const plan of plans) this.savedSnapshots[plan.id] = serializePlan(plan)
          this.loadedFor = userId
          this.status = 'ready'
        })
        .catch((error: unknown) => {
          this.error = messageOf(error)
          this.status = 'error'
        })
        .finally(() => {
          pendingLoad = null
        })
      return pendingLoad
    },

    /**
     * Le plan `planId`, chargé si besoin. `null` s'il n'existe pas ou n'appartient pas au compte connecté (la base
     * ne distingue pas les deux, volontairement) — ou si le chargement a échoué : voir alors `status`/`error`.
     */
    async ensurePlan(planId: string): Promise<Plan | null> {
      await this.load()
      const known = this.getPlanById(planId)
      if (known || this.status === 'error') return known

      // Absent de la liste (atelier créé depuis un autre onglet, par exemple) : lecture ciblée.
      try {
        const plan = await planService.fetchPlan(planId)
        if (plan) {
          this.plans.push(plan)
          this.savedSnapshots[plan.id] = serializePlan(plan)
        }
        return plan
      } catch (error) {
        this.error = messageOf(error)
        this.status = 'error'
        return null
      }
    },

    /** Crée un atelier vide pour le compte connecté (enregistré en base) et le renvoie. */
    async createPlan(nom: string): Promise<Plan> {
      const userId = useAuthStore().user?.id
      if (!userId) throw new Error('Connexion requise pour créer un atelier.')
      const plan = await planService.createPlan(userId, nom)
      this.plans.unshift(plan)
      this.savedSnapshots[plan.id] = serializePlan(plan)
      return plan
    },

    /**
     * Enregistre le plan en base (une transaction : tout ou rien). Lève en cas d'échec — le plan reste alors
     * « modifié » et rien n'a changé côté base. Sans effet si l'enregistrement de ce plan est déjà en cours.
     */
    async savePlan(planId: string): Promise<void> {
      const plan = this.getPlanById(planId)
      if (!plan) throw new Error('Atelier introuvable.')
      if (this.savingIds.includes(planId)) return

      this.savingIds.push(planId)
      // Instantané pris AVANT l'envoi, à l'instant où le plan est lu pour être envoyé : une modification faite
      // pendant l'envoi n'est pas enregistrée, elle reste donc correctement signalée comme « modifiée ».
      const snapshot = serializePlan(plan)
      try {
        await planService.savePlan(plan)
        this.savedSnapshots[planId] = snapshot
      } finally {
        this.savingIds = this.savingIds.filter((id) => id !== planId)
      }
    },

    addRoom(planId: string, room: Room) {
      this.getPlanById(planId)?.rooms.push(room)
    },

    removeRoom(planId: string, roomId: string) {
      this.removeRooms(planId, [roomId])
    },

    /** Supprime des pièces et, avec elles, les portes et fenêtres qui y étaient percées. */
    removeRooms(planId: string, roomIds: string[]) {
      const plan = this.getPlanById(planId)
      if (!plan) return
      plan.rooms = plan.rooms.filter((room) => !roomIds.includes(room.id))
      plan.roomOpenings = plan.roomOpenings.filter((opening) => !roomIds.includes(opening.roomId))
    },

    setWallType(planId: string, wallType: WallType) {
      const plan = this.getPlanById(planId)
      if (plan) plan.wallType = wallType
    },

    setHouse(planId: string, house: HouseBase | null) {
      const plan = this.getPlanById(planId)
      if (plan) plan.house = house
    },

    addRoomOpening(planId: string, opening: RoomOpening) {
      this.getPlanById(planId)?.roomOpenings.push(opening)
    },

    removeRoomOpening(planId: string, openingId: string) {
      const plan = this.getPlanById(planId)
      if (plan) plan.roomOpenings = plan.roomOpenings.filter((opening) => opening.id !== openingId)
    },

    addHouseOpening(planId: string, opening: EdgeOpening) {
      this.getPlanById(planId)?.house?.openings.push(opening)
    },

    removeHouseOpening(planId: string, openingId: string) {
      const house = this.getPlanById(planId)?.house
      if (house) house.openings = house.openings.filter((opening) => opening.id !== openingId)
    },

    setRoad(planId: string, road: Road | null) {
      const plan = this.getPlanById(planId)
      if (plan?.terrain) plan.terrain.road = road
    },

    setFenced(planId: string, fenced: boolean) {
      const plan = this.getPlanById(planId)
      if (plan?.terrain) plan.terrain.fenced = fenced
    },

    addGate(planId: string, gate: Gate) {
      const plan = this.getPlanById(planId)
      if (!plan?.terrain) return
      plan.terrain.gates = [...(plan.terrain.gates ?? []), gate]
    },

    removeGate(planId: string, gateId: string) {
      const plan = this.getPlanById(planId)
      if (!plan?.terrain) return
      plan.terrain.gates = (plan.terrain.gates ?? []).filter((gate) => gate.id !== gateId)
    },

    setTerrain(planId: string, terrain: Terrain) {
      const plan = this.getPlanById(planId)
      if (!plan) return
      plan.terrain = terrain
    },

    rotateTerrain(planId: string, deltaDeg: number) {
      const plan = this.getPlanById(planId)
      if (!plan?.terrain) return
      plan.terrain = rotateTerrainVertices(plan.terrain, deltaDeg)
    },

    /** Déplace tout le contenu du plan d'un même décalage ; le repère (axes, grille) ne bouge pas. */
    moveAll(planId: string, delta: PlanPoint) {
      const plan = this.getPlanById(planId)
      if (plan) translatePlanContent(plan, delta)
    },

    moveTerrain(planId: string, delta: PlanPoint) {
      const plan = this.getPlanById(planId)
      if (!plan?.terrain) return
      plan.terrain = translateTerrainVertices(plan.terrain, delta)
    },
  },
})
