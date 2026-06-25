<script setup lang="ts">
import { computed } from 'vue'
import type { GameState } from '../game/game'
import { WEAPONS, WeaponId } from '../game/config'

const props = defineProps<{ state: GameState }>()
const emit = defineEmits<{ (e: 'buy', id: WeaponId): void; (e: 'armor'): void; (e: 'next'): void }>()

const buyables: WeaponId[] = ['pistol', 'smg', 'ak', 'shotgun', 'sniper']
const items = computed(() =>
  buyables.map((id) => {
    const d = WEAPONS[id]
    const owned = props.state.owned.includes(id)
    const cost = owned ? Math.floor(d.price * 0.4) : d.price
    return {
      id, name: d.name, cost, owned,
      can: props.state.money >= cost,
      dmg: d.damage, rpm: d.rpm, mag: d.magSize,
      label: owned ? (cost > 0 ? `補彈 $${cost}` : '已持有') : `$${d.price}`,
    }
  }),
)
const armorCost = 650
</script>

<template>
  <div class="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center z-20">
    <div class="w-[760px] max-w-[94vw] bg-zinc-900/90 rounded-2xl border border-yellow-400/30 p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-2xl font-black text-yellow-400">軍火庫 · 第 {{ state.wave }} 波結束</h2>
          <p class="text-white/50 text-sm">選購裝備後開始下一波</p>
        </div>
        <div class="text-right">
          <div class="text-3xl font-black text-green-400">$ {{ state.money }}</div>
          <div class="text-xs text-white/50">可用資金</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <button v-for="it in items" :key="it.id"
          :disabled="!it.can || (it.owned && it.cost === 0)"
          @click="emit('buy', it.id)"
          class="text-left p-3 rounded-xl border transition group"
          :class="[
            it.owned ? 'border-green-500/40 bg-green-900/20' : 'border-white/10 bg-black/30',
            (it.can && !(it.owned && it.cost===0)) ? 'hover:border-yellow-400 hover:bg-yellow-400/10 cursor-pointer' : 'opacity-50 cursor-not-allowed',
          ]">
          <div class="flex items-center justify-between">
            <span class="font-bold text-white">{{ it.name }}<span v-if="it.owned" class="ml-2 text-[10px] text-green-400">擁有</span></span>
            <span class="font-black" :class="it.can ? 'text-yellow-400' : 'text-white/40'">{{ it.label }}</span>
          </div>
          <div class="mt-1 flex gap-3 text-[11px] text-white/50">
            <span>傷害 {{ it.dmg }}</span><span>射速 {{ it.rpm }}</span><span>彈匣 {{ it.mag }}</span>
          </div>
        </button>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <button @click="emit('armor')"
          :disabled="state.armor >= 100 || state.money < armorCost"
          class="flex-1 p-3 rounded-xl border border-sky-500/40 bg-sky-900/20 text-left transition"
          :class="(state.armor < 100 && state.money >= armorCost) ? 'hover:border-sky-400 hover:bg-sky-400/10 cursor-pointer' : 'opacity-50 cursor-not-allowed'">
          <div class="flex justify-between">
            <span class="font-bold text-sky-200">護甲</span>
            <span class="font-black text-sky-300">{{ state.armor >= 100 ? '已滿' : '$' + armorCost }}</span>
          </div>
          <div class="text-[11px] text-white/50 mt-1">吸收 50% 傷害</div>
        </button>
        <button @click="emit('next')"
          class="flex-1 p-4 rounded-xl bg-yellow-400 text-black font-black text-lg hover:bg-yellow-300 transition cursor-pointer">
          開始第 {{ state.wave + 1 }} 波 ▶
        </button>
      </div>
    </div>
  </div>
</template>
