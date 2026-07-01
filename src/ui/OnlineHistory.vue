<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchOnlineHistory, type HourPeak } from '../game/api'

defineEmits<{ (e: 'back'): void }>()

const raw = ref<HourPeak[]>([])
const range = ref<'day' | 'week' | 'month'>('month')   // 預設近 30 天
const loading = ref(true)
const offline = ref(false)

onMounted(async () => {
  const r = await fetchOnlineHistory(30)   // 取 30 天資料，各範圍在前端衍生
  offline.value = r === null
  raw.value = r || []
  loading.value = false
})

// 依範圍組出長條：day=24 小時桶；week/month=每日峰值
const bars = computed(() => {
  const map = new Map(raw.value.map((h) => [h.hour, h.peak]))
  const nowHour = Math.floor(Date.now() / 3_600_000)
  if (range.value === 'day') {
    const arr: { peak: number }[] = []
    for (let h = nowHour - 23; h <= nowHour; h++) arr.push({ peak: map.get(h) || 0 })
    return arr
  }
  const days = range.value === 'week' ? 7 : 30
  const dayMax = new Map<number, number>()
  for (const [h, p] of map) { const d = Math.floor(h / 24); dayMax.set(d, Math.max(dayMax.get(d) || 0, p)) }
  const nowDay = Math.floor(nowHour / 24)
  const arr: { peak: number }[] = []
  for (let d = nowDay - (days - 1); d <= nowDay; d++) arr.push({ peak: dayMax.get(d) || 0 })
  return arr
})
const maxPeak = computed(() => Math.max(1, ...bars.value.map((b) => b.peak)))
const rangeLabel = computed(() => (range.value === 'day' ? '近 24 小時（每小時）' : range.value === 'week' ? '近 7 天（每日峰值）' : '近 30 天（每日峰值）'))
</script>

<template>
  <div class="absolute inset-0 overflow-auto bg-black/85 backdrop-blur-sm z-40 flex flex-col items-center py-8 px-4">
    <div class="w-full max-w-2xl">
      <div class="flex items-center justify-between mb-4">
        <button @click="$emit('back')" class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer">← 返回</button>
        <h2 class="text-3xl font-black text-yellow-400">📈 線上人數</h2>
        <span class="w-16"></span>
      </div>

      <div class="flex gap-2 justify-center mb-4">
        <button v-for="r in (['day','week','month'] as const)" :key="r" @click="range = r"
          class="px-4 py-1.5 rounded-lg font-bold text-sm transition cursor-pointer"
          :class="range === r ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'">
          {{ r === 'day' ? '24 小時' : r === 'week' ? '7 天' : '30 天' }}
        </button>
      </div>

      <div v-if="loading" class="text-center text-white/40 py-10">載入中…</div>
      <div v-else-if="offline" class="text-center text-white/40 py-10">需連線到全球後端才有歷史資料。</div>
      <div v-else>
        <div class="text-[11px] text-white/40 tracking-widest mb-1 text-center">{{ rangeLabel }} · 峰值 {{ maxPeak }} 人</div>
        <div class="flex items-end justify-center gap-0.5 h-40 bg-white/5 rounded-xl px-3 py-2">
          <div v-for="(b, i) in bars" :key="i"
            class="flex-1 rounded-sm min-h-[2px] transition-all"
            :class="b.peak > 0 ? 'bg-lime-400/70 hover:bg-lime-300' : 'bg-white/10'"
            :style="{ height: Math.max(3, (b.peak / maxPeak) * 100) + '%' }"
            :title="b.peak + ' 人'"></div>
        </div>
        <p class="mt-2 text-center text-xs text-white/30">資料由玩家遊玩時的心跳累積（每小時峰值）</p>
      </div>
    </div>
  </div>
</template>
