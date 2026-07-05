<script setup lang="ts">
import { computed } from 'vue'
import type { GameState } from '../game/game'
import { WEAPONS, WeaponId, MEDKIT, DOG, DOG_UPGRADES, DogUpgradeKind, WEAPON_MODS, WeaponModKind } from '../game/config'

const props = defineProps<{ state: GameState }>()
const emit = defineEmits<{
  (e: 'buy', id: WeaponId): void
  (e: 'armor', n: number | 'max'): void
  (e: 'medkit', n: number | 'max'): void
  (e: 'dog'): void
  (e: 'dogup', kind: DogUpgradeKind): void
  (e: 'wmod', kind: WeaponModKind): void
  (e: 'next'): void
}>()

const canMedkit = computed(() => props.state.money >= MEDKIT.price)
const canDog = computed(() => props.state.dogCount < DOG.maxCount && props.state.money >= DOG.price)

const buyables: WeaponId[] = ['pistol', 'smg', 'ak', 'shotgun', 'sniper', 'supersniper']
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
// 批量購買選項（護甲/補血包共用）
const bulkBtns: { label: string; n: number | 'max' }[] = [
  { label: '×1', n: 1 }, { label: '×10', n: 10 }, { label: 'MAX', n: 'max' },
]

// 武器改造：一次性購買
const wmods = computed(() =>
  (Object.keys(WEAPON_MODS) as WeaponModKind[]).map((kind) => {
    const def = WEAPON_MODS[kind]
    const owned = props.state.weaponMods[kind]
    return {
      kind, icon: def.icon, name: def.name, desc: def.desc, owned,
      label: owned ? '已裝備' : `$${def.price}`,
      can: !owned && props.state.money >= def.price,
    }
  }),
)

// 軍犬升級：等級/價格/可否購買
const dogUps = computed(() =>
  (Object.keys(DOG_UPGRADES) as DogUpgradeKind[]).map((kind) => {
    const def = DOG_UPGRADES[kind]
    const lv = props.state.dogLv[kind]
    const maxed = lv >= def.max
    const cost = def.baseCost * (lv + 1)
    return {
      kind, icon: def.icon, name: def.name, lv, maxed,
      label: maxed ? 'MAX' : `$${cost}`,
      can: !maxed && props.state.money >= cost,
      pct: `+${Math.round(def.perLevel * (lv + 1) * 100)}%`,
    }
  }),
)
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
        <div class="flex-1 p-3 rounded-xl border border-sky-500/40 bg-sky-900/20 text-left transition"
          :class="state.money >= armorCost ? '' : 'opacity-50'">
          <div class="flex justify-between">
            <span class="font-bold text-sky-200">護甲 <span class="text-sky-400/70 text-[11px]">{{ state.armor }}</span></span>
            <span class="font-black text-sky-300">${{ armorCost }}</span>
          </div>
          <div class="text-[11px] text-white/50 mt-1 mb-1.5">吸收 50% 傷害，每件 +100 可疊加</div>
          <div class="flex gap-1">
            <button v-for="b in bulkBtns" :key="'a' + b.label" @click="emit('armor', b.n)"
              :disabled="state.money < armorCost"
              class="flex-1 py-1 rounded-md text-[11px] font-bold transition"
              :class="state.money >= armorCost ? 'bg-sky-500/25 text-sky-200 hover:bg-sky-400/40 cursor-pointer' : 'bg-white/5 text-white/30 cursor-not-allowed'">
              {{ b.label }}
            </button>
          </div>
        </div>
        <div class="flex-1 p-3 rounded-xl border border-green-500/40 bg-green-900/20 text-left transition"
          :class="canMedkit ? '' : 'opacity-50'">
          <div class="flex justify-between">
            <span class="font-bold text-green-200">補血包 <span class="text-green-400/70 text-[11px]">{{ state.hp }}/{{ state.maxHp }}</span></span>
            <span class="font-black text-green-300">${{ MEDKIT.price }}</span>
          </div>
          <div class="text-[11px] text-white/50 mt-1 mb-1.5">+{{ MEDKIT.heal }} HP 可疊加，溢出提升血量上限</div>
          <div class="flex gap-1">
            <button v-for="b in bulkBtns" :key="'m' + b.label" @click="emit('medkit', b.n)"
              :disabled="!canMedkit"
              class="flex-1 py-1 rounded-md text-[11px] font-bold transition"
              :class="canMedkit ? 'bg-green-500/25 text-green-200 hover:bg-green-400/40 cursor-pointer' : 'bg-white/5 text-white/30 cursor-not-allowed'">
              {{ b.label }}
            </button>
          </div>
        </div>
        <button @click="emit('dog')" :disabled="!canDog"
          class="flex-1 p-3 rounded-xl border border-amber-500/40 bg-amber-900/20 text-left transition"
          :class="canDog ? 'hover:border-amber-400 hover:bg-amber-400/10 cursor-pointer' : 'opacity-50 cursor-not-allowed'">
          <div class="flex justify-between">
            <span class="font-bold text-amber-200">🐕 軍犬 <span class="text-amber-400/70 text-[11px]">{{ state.dogCount }}/{{ DOG.maxCount }}</span></span>
            <span class="font-black text-amber-300">{{ state.dogCount >= DOG.maxCount ? '已達上限' : '$' + DOG.price }}</span>
          </div>
          <div class="text-[11px] text-white/50 mt-1">引怪 + 咬怪，最多 {{ DOG.maxCount }} 隻</div>
        </button>
        <button @click="emit('next')"
          class="flex-1 p-4 rounded-xl bg-yellow-400 text-black font-black text-lg hover:bg-yellow-300 transition cursor-pointer">
          開始第 {{ state.wave + 1 }} 波 ▶
          <span v-if="state.endless" class="block text-sm font-bold text-black/60">⏱ {{ Math.ceil(state.buyCountdown) }} 秒後自動開始</span>
        </button>
      </div>

      <!-- 武器改造（一次性，本場有效） -->
      <div class="mt-3 flex items-center gap-3">
        <div class="text-[11px] text-purple-300/70 font-bold tracking-widest shrink-0">武器改造</div>
        <button v-for="m in wmods" :key="m.kind" @click="emit('wmod', m.kind)" :disabled="!m.can"
          class="flex-1 px-3 py-2 rounded-lg border text-left transition"
          :class="[
            m.owned ? 'border-purple-400/60 bg-purple-500/15' : 'border-purple-500/30 bg-purple-900/10',
            m.can ? 'hover:border-purple-400 hover:bg-purple-400/10 cursor-pointer' : m.owned ? '' : 'opacity-50 cursor-not-allowed',
          ]">
          <div class="flex justify-between items-center">
            <span class="text-[12px] font-bold text-purple-100">{{ m.icon }} {{ m.name }}</span>
            <span class="text-[12px] font-black" :class="m.owned ? 'text-purple-300' : 'text-purple-300/90'">{{ m.label }}</span>
          </div>
          <div class="text-[10px] text-white/40">{{ m.desc }}</div>
        </button>
      </div>

      <!-- 軍犬升級（全體共用，本場有效） -->
      <div class="mt-3 flex items-center gap-3">
        <div class="text-[11px] text-amber-300/70 font-bold tracking-widest shrink-0">軍犬升級</div>
        <button v-for="u in dogUps" :key="u.kind" @click="emit('dogup', u.kind)" :disabled="!u.can"
          class="flex-1 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-900/10 text-left transition"
          :class="u.can ? 'hover:border-amber-400 hover:bg-amber-400/10 cursor-pointer' : 'opacity-50 cursor-not-allowed'">
          <div class="flex justify-between items-center">
            <span class="text-[12px] font-bold text-amber-100">{{ u.icon }} {{ u.name }} <span class="text-amber-400/70">Lv.{{ u.lv }}</span></span>
            <span class="text-[12px] font-black" :class="u.maxed ? 'text-white/40' : 'text-amber-300'">{{ u.label }}</span>
          </div>
          <div class="text-[10px] text-white/40">{{ u.maxed ? '已滿級' : '下一級 ' + u.pct }}</div>
        </button>
      </div>
    </div>
  </div>
</template>
