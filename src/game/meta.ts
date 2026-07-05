// ============================================================================
// meta.ts — 跨場永久進度（資料層）：永久升級 + 本地排行榜（localStorage）。
// 換新遊戲只改 KEY 前綴與升級項。GAME.md §5 的全球排行榜可在此基礎上接 API。
// ============================================================================

const KEY = 'ds_meta_v1'

export interface MetaUpgradeDef {
  id: string
  name: string
  desc: string
  perLevel: number
  max: number
  baseCost: number
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: 'maxhp',  name: '最大生命', desc: '每級 +20 生命上限',   perLevel: 20,   max: 5, baseCost: 200 },
  { id: 'armor',  name: '起始護甲', desc: '每級 +20 開局護甲',   perLevel: 20,   max: 5, baseCost: 250 },
  { id: 'speed',  name: '移動速度', desc: '每級 +5% 移速',       perLevel: 0.05, max: 4, baseCost: 300 },
  { id: 'damage', name: '武器傷害', desc: '每級 +6% 全武器傷害', perLevel: 0.06, max: 5, baseCost: 350 },
  { id: 'money',  name: '起始資金', desc: '每級 +200 開局金錢',  perLevel: 200,  max: 5, baseCost: 200 },
]

export interface BoardEntry { score: number; wave: number; date: string }

interface MetaData {
  coins: number
  levels: Record<string, number>
  best: number
  board: BoardEntry[]
}

function defaults(): MetaData {
  return { coins: 0, levels: {}, best: 0, board: [] }
}

export interface MetaBonuses {
  maxHp: number
  armor: number
  speedMult: number
  damageMult: number
  startMoney: number
}

class MetaStore {
  private data: MetaData = defaults()

  constructor() { this.load() }

  load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) this.data = { ...defaults(), ...JSON.parse(raw) }
    } catch { this.data = defaults() }
  }
  private persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)) } catch { /* ignore */ }
  }

  get coins() { return this.data.coins }
  get best() { return this.data.best }
  get board() { return this.data.board }
  level(id: string) { return this.data.levels[id] || 0 }

  costOf(id: string): number {
    const def = META_UPGRADES.find((u) => u.id === id)!
    return def.baseCost * (this.level(id) + 1)
  }
  canBuy(id: string): boolean {
    const def = META_UPGRADES.find((u) => u.id === id)!
    return this.level(id) < def.max && this.data.coins >= this.costOf(id)
  }
  buy(id: string): boolean {
    if (!this.canBuy(id)) return false
    this.data.coins -= this.costOf(id)
    this.data.levels[id] = this.level(id) + 1
    this.persist()
    return true
  }

  bonuses(): MetaBonuses {
    return {
      maxHp: 100 + this.level('maxhp') * 20,
      armor: this.level('armor') * 20,
      speedMult: 1 + this.level('speed') * 0.05,
      damageMult: 1 + this.level('damage') * 0.06,
      startMoney: this.level('money') * 200,
    }
  }

  /** 一場結束：發放 meta 金幣、更新最高分與排行榜。回傳本場獲得的金幣。 */
  endRun(score: number, wave: number): number {
    const earned = score   // 1 分 = 1 星幣
    this.data.coins += earned
    this.data.best = Math.max(this.data.best, score)
    this.data.board.push({ score, wave, date: new Date().toISOString().slice(0, 10) })
    this.data.board.sort((a, b) => b.score - a.score)
    this.data.board = this.data.board.slice(0, 10)
    this.persist()
    return earned
  }
}

export const Meta = new MetaStore()
