<script setup lang="ts">
import { ref, computed } from 'vue'
import { Meta, META_UPGRADES } from '../game/meta'

const emit = defineEmits<{ (e: 'close'): void }>()
const version = ref(0) // 購買後強制刷新

const coins = computed(() => { version.value; return Meta.coins })
const items = computed(() =>
  (version.value, META_UPGRADES.map((u) => ({
    id: u.id, name: u.name, desc: u.desc,
    level: Meta.level(u.id), max: u.max,
    cost: Meta.costOf(u.id), can: Meta.canBuy(u.id),
    maxed: Meta.level(u.id) >= u.max,
  }))),
)

function buy(id: string) { if (Meta.buy(id)) version.value++ }
</script>

<template>
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="w-[640px] max-w-[94vw] bg-zinc-900/95 rounded-2xl border border-yellow-400/30 p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-2xl font-black text-yellow-400">永久升級</h2>
          <p class="text-white/50 text-sm">用星幣解鎖跨場永久強化</p>
        </div>
        <div class="text-right">
          <div class="text-3xl font-black text-cyan-300">★ {{ coins }}</div>
          <div class="text-xs text-white/50">星幣</div>
        </div>
      </div>

      <div class="space-y-2">
        <div v-for="it in items" :key="it.id"
          class="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-black/30">
          <div class="flex-1">
            <div class="font-bold text-white">{{ it.name }}
              <span class="ml-2 text-xs text-cyan-300">Lv.{{ it.level }}/{{ it.max }}</span>
            </div>
            <div class="text-[11px] text-white/50">{{ it.desc }}</div>
            <div class="flex gap-1 mt-1">
              <div v-for="n in it.max" :key="n" class="w-6 h-1.5 rounded-full"
                :class="n <= it.level ? 'bg-cyan-400' : 'bg-white/15'"></div>
            </div>
          </div>
          <button @click="buy(it.id)" :disabled="!it.can"
            class="ml-4 px-4 py-2 rounded-lg font-bold text-sm transition"
            :class="it.maxed ? 'bg-green-700/40 text-green-300 cursor-default'
              : it.can ? 'bg-yellow-400 text-black hover:bg-yellow-300 cursor-pointer'
              : 'bg-white/10 text-white/40 cursor-not-allowed'">
            {{ it.maxed ? '已滿級' : '★ ' + it.cost }}
          </button>
        </div>
      </div>

      <button @click="emit('close')"
        class="mt-5 w-full p-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition cursor-pointer">
        返回
      </button>
    </div>
  </div>
</template>
