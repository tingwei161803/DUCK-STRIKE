<script setup lang="ts">
import { ref } from 'vue'
import { ENEMIES, WEAPONS, EnemyId, WeaponId } from '../game/config'

const props = defineProps<{ initial?: 'enemies' | 'weapons' }>()
defineEmits<{ (e: 'back'): void }>()

const tab = ref<'enemies' | 'weapons'>(props.initial || 'enemies')

const enemyDesc: Record<EnemyId, string> = {
  grunt: '基本遠程兵，數量多、威脅低。',
  rusher: '高速衝刺、貼身近戰，會逼近你。',
  slasher: '士兵外觀，全速衝鋒揮刀砍擊（近戰）。',
  hazmat: '厚血重裝兵，耐打、傷害高。',
  bomber: '橘色自爆兵，貼身引爆造成範圍傷害。',
  boss: '放大紫色王，高血高傷、會放彈幕與召喚小兵。',
}
const enemyList = (Object.keys(ENEMIES) as EnemyId[]).map((id) => ({ ...ENEMIES[id], desc: enemyDesc[id] }))

const weaponList = (Object.keys(WEAPONS) as WeaponId[]).map((id) => {
  const w = WEAPONS[id]
  const tags: string[] = []
  if (w.melee) tags.push('近戰')
  if (w.auto) tags.push('全自動')
  if (w.pellets > 1) tags.push(`散彈 ×${w.pellets}`)
  if (w.scope) tags.push('可開鏡')
  return { ...w, tags }
})
</script>

<template>
  <div class="absolute inset-0 overflow-auto bg-black/85 backdrop-blur-sm z-40 flex flex-col items-center py-8 px-4">
    <div class="w-full max-w-2xl">
      <div class="flex items-center justify-between mb-4">
        <button @click="$emit('back')" class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer">← 返回</button>
        <h2 class="text-3xl font-black text-yellow-400">圖鑑</h2>
        <span class="w-16"></span>
      </div>

      <div class="flex gap-2 justify-center mb-4">
        <button @click="tab = 'enemies'" class="px-5 py-2 rounded-lg font-bold text-sm transition cursor-pointer"
          :class="tab === 'enemies' ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'">🐾 怪物</button>
        <button @click="tab = 'weapons'" class="px-5 py-2 rounded-lg font-bold text-sm transition cursor-pointer"
          :class="tab === 'weapons' ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'">🔫 武器</button>
      </div>

      <!-- 怪物 -->
      <div v-if="tab === 'enemies'" class="space-y-2">
        <div v-for="e in enemyList" :key="e.id" class="bg-zinc-900/70 rounded-xl border border-white/10 p-3">
          <div class="flex items-center justify-between">
            <span class="font-black text-white">{{ e.name }}<span v-if="e.boss" class="ml-2 text-[10px] text-purple-300">王</span></span>
            <div class="flex gap-3 text-[11px] text-white/50 tabular-nums">
              <span>❤ {{ e.hp }}</span><span>⚔ {{ e.damage }}</span><span>💨 {{ e.speed }}</span><span class="text-green-300">${{ e.reward }}</span>
            </div>
          </div>
          <p class="text-white/60 text-xs mt-1">{{ e.desc }}</p>
        </div>
      </div>

      <!-- 武器 -->
      <div v-else class="space-y-2">
        <div v-for="w in weaponList" :key="w.id" class="bg-zinc-900/70 rounded-xl border border-white/10 p-3">
          <div class="flex items-center justify-between">
            <span class="font-black text-white">{{ w.name }}
              <span v-for="t in w.tags" :key="t" class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{{ t }}</span>
            </span>
            <span class="font-black text-yellow-400 text-sm">{{ w.price > 0 ? '$' + w.price : '初始' }}</span>
          </div>
          <div class="flex gap-3 text-[11px] text-white/50 mt-1 tabular-nums">
            <span>傷害 {{ w.damage }}</span>
            <span v-if="!w.melee">射速 {{ w.rpm }}</span>
            <span v-if="w.magSize > 0">彈匣 {{ w.magSize }}</span>
            <span v-if="!w.melee">爆頭 ×{{ w.headMult }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
