// ============================================================================
// rng.ts — 可種子化亂數（引擎層）。每日挑戰用：同一天全球玩家同一配置。
// 未設種子時直接用 Math.random；設種子後改用 mulberry32（確定性序列）。
// 波次組成洗牌 / 出生點 / 掉落判定走這裡；瞄準散布等手感類仍用 Math.random。
// ============================================================================

let fn: () => number = Math.random

/** 設定種子（null = 還原為 Math.random）。 */
export function setSeed(seed: string | null) {
  if (seed === null) { fn = Math.random; return }
  // 字串雜湊（xmur3 簡化版）→ mulberry32
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  fn = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rnd() { return fn() }

/** 今日種子字串（UTC 日期，全球一致）。 */
export function todaySeed(): string { return 'ds-' + new Date().toISOString().slice(0, 10) }
