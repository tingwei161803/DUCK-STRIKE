// ============================================================================
// companion.ts — 軍犬同伴（引擎層）：主動找怪追咬（咬怪），並吸引附近敵人（引怪）。
// 高血量、脫戰回血；死亡後需重買。敵人的「引怪」判定在 enemies.ts（靠近狗就轉目標）。
// ============================================================================
import { Scene, Vector3, AnimationGroup } from '@babylonjs/core'
import { loadModel, instantiate, scaleForHeight, LoadedModel, ModelInstance } from './model-loader'
import { Player } from './player'
import { GameMap } from './map'
import { DOG, WORLD } from './config'
import type { Enemy } from './enemies'
import { SFX } from './sound'

const DOG_ANIMS = { idle: /idle$/i, run: /^run$|walk/i, attack: /attack/i, death: /death/i }

// 全軍犬共用同一份模型模板（loadModel 本身有快取；此處再存一份供同步建立實例用）
let DOG_MODEL: LoadedModel | null = null

export class Companion {
  scene: Scene
  player: Player
  map: GameMap
  findEnemy: (pos: Vector3, range: number) => Enemy | null
  damageEnemy: (e: Enemy, dmg: number) => void

  inst: ModelInstance | null = null
  hp = 0
  alive = false
  curTarget: Enemy | null = null   // 目前鎖定的敵人（給目標分散邏輯統計用）
  private biteCd = 0
  private lastHurt = -99
  private deathT = 0
  private curAnim: AnimationGroup | null = null

  constructor(
    scene: Scene, player: Player, map: GameMap,
    findEnemy: (pos: Vector3, range: number) => Enemy | null,
    damageEnemy: (e: Enemy, dmg: number) => void,
  ) {
    this.scene = scene; this.player = player; this.map = map
    this.findEnemy = findEnemy; this.damageEnemy = damageEnemy
  }

  // 共用模型只需載入一次；之後每隻軍犬各自 instantiate 出獨立實例
  static async preload(scene: Scene) {
    if (!DOG_MODEL) DOG_MODEL = await loadModel(scene, '/models/characters/dog.gltf')
  }

  private ensureInst() {
    if (this.inst) return
    const scale = scaleForHeight(DOG_MODEL!, DOG.scale)
    this.inst = instantiate(this.scene, DOG_MODEL!, scale, DOG_ANIMS, true)
    this.inst.holder.setEnabled(false)
  }

  get position(): Vector3 { return this.inst ? this.inst.holder.position : Vector3.Zero() }

  spawn(pos: Vector3) {
    this.ensureInst()
    this.hp = DOG.maxHp; this.alive = true; this.deathT = 0; this.biteCd = 0; this.lastHurt = -99; this.curTarget = null
    this.inst!.holder.setEnabled(true)
    this.inst!.holder.position.set(pos.x, 0, pos.z)
    this.play('idle', true)
  }

  healToFull() { if (this.alive) this.hp = DOG.maxHp }

  hurt(dmg: number) {
    if (!this.alive) return
    this.hp -= dmg
    this.lastHurt = performance.now() / 1000
    if (this.hp <= 0) { this.hp = 0; this.die() }
  }

  private die() {
    this.alive = false
    this.curTarget = null
    this.deathT = 2.0
    this.play('death', false)
    SFX.enemyDie()
  }

  clear() {
    if (this.inst) { this.inst.holder.setEnabled(false); this.curAnim?.stop(); this.curAnim = null }
    this.alive = false; this.hp = 0; this.deathT = 0; this.curTarget = null
  }

  private play(key: keyof typeof DOG_ANIMS, loop: boolean) {
    if (!this.inst) return
    const g = this.inst.anims[key]
    if (!g || this.curAnim === g) return
    this.curAnim?.stop()
    g.start(loop, 1.0, g.from, g.to)
    this.curAnim = g
  }

  update(dt: number) {
    if (!this.inst) return
    if (!this.alive) {
      if (this.deathT > 0) { this.deathT -= dt; if (this.deathT <= 0) this.inst.holder.setEnabled(false) }
      return
    }
    if (this.biteCd > 0) this.biteCd -= dt
    const pos = this.inst.holder.position

    const enemy = this.findEnemy(pos, DOG.seekRange)
    this.curTarget = enemy
    let target: Vector3
    let biteMode = false
    if (enemy) {
      target = enemy.inst.holder.position
      if (Vector3.Distance(pos, target) <= DOG.biteRange) biteMode = true
    } else {
      target = this.player.position   // 無怪 → 跟隨玩家
    }
    const to = target.subtract(pos); to.y = 0
    const dist = to.length()
    const dir = dist > 0.001 ? to.scale(1 / dist) : new Vector3(0, 0, 1)
    this.inst.holder.rotation.y = Math.atan2(dir.x, dir.z)

    if (biteMode && enemy) {
      this.play('attack', true)
      if (this.biteCd <= 0) { this.biteCd = DOG.biteCd; this.damageEnemy(enemy, DOG.bite); SFX.shoot('knife') }
    } else {
      const stopDist = enemy ? DOG.biteRange * 0.8 : DOG.followDist
      if (dist > stopDist) { this.play('run', true); this.move(dir, dt, pos) }
      else this.play('idle', true)
    }

    // 脫戰回血
    const now = performance.now() / 1000
    if (now - this.lastHurt > DOG.regenDelay && this.hp < DOG.maxHp) {
      this.hp = Math.min(DOG.maxHp, this.hp + DOG.regenRate * dt)
    }
  }

  private move(dir: Vector3, dt: number, pos: Vector3) {
    const step = DOG.speed * dt
    const h = WORLD.arenaHalf - 1
    const tryMove = (vx: number, vz: number) => {
      const nx = pos.x + vx, nz = pos.z + vz
      if (!this.map.blocked(nx, nz, 0.5) && Math.abs(nx) < h && Math.abs(nz) < h) { pos.x = nx; pos.z = nz; return true }
      return false
    }
    if (tryMove(dir.x * step, dir.z * step)) return
    if (Math.abs(dir.x) > 0.05 && tryMove(dir.x * step, 0)) return
    if (Math.abs(dir.z) > 0.05 && tryMove(0, dir.z * step)) return
    for (const a of [0.6, -0.6, 1.2, -1.2]) {
      const c = Math.cos(a), s = Math.sin(a)
      const nd = new Vector3(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c)
      if (tryMove(nd.x * step, nd.z * step)) return
    }
  }
}
