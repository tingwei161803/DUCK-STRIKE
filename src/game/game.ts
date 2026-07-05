// ============================================================================
// game.ts — 主迴圈總指揮（引擎層）：場景/光照、命中解析、波次、經濟、
// 計分、購買、狀態機。把可重用流程與資料/資產解耦。
// ============================================================================
import {
  Engine, Scene, Vector3, HemisphericLight, DirectionalLight, Color3, Color4,
  Ray, GlowLayer, AbstractMesh, MeshBuilder, StandardMaterial, Matrix,
} from '@babylonjs/core'
import { Input } from './input'
import { Player } from './player'
import { GameMap } from './map'
import { Effects } from './effects'
import { WeaponSystem } from './weapons'
import { EnemyManager, Enemy } from './enemies'
import { PickupManager } from './pickups'
import { GrenadeManager } from './grenades'
import { Companion, DogMode } from './companion'
import { Meta } from './meta'
import {
  WEAPONS, WeaponId, ENEMIES, EnemyId, waveSpec, ECONOMY, PLAYER,
  DIFFICULTIES, Difficulty, DROP, KILLSTREAK, PickupKind, GRENADE, ULTIMATE, MEDKIT, DOG,
  DOG_UPGRADES, DogUpgradeKind, GrenadeKind, GRENADE_KINDS, GRENADE_FX,
  WEAPON_MODS, WeaponModKind,
} from './config'
import { SFX, initAudio } from './sound'

export type Phase = 'loading' | 'menu' | 'playing' | 'buy' | 'paused' | 'dead'

// 螢幕飄字（傷害數字 / 擊殺獎勵）
export interface FloatText {
  id: number; x: number; y: number; text: string; color: string; born: number; big: boolean
}

export interface GameState {
  phase: Phase
  hp: number
  maxHp: number
  armor: number
  money: number
  weaponName: string
  ammoMag: number
  ammoReserve: number
  reloading: boolean
  aiming: boolean
  wave: number
  enemiesLeft: number
  kills: number
  score: number
  streak: number
  bestStreak: number
  hitMarker: number       // 時間戳，UI 用來閃命中標記
  headshotMarker: number
  damageFlash: number
  message: string
  owned: WeaponId[]
  current: WeaponId
  loadPct: number
  floats: FloatText[]
  difficulty: Difficulty
  frenzyT: number          // 狂暴剩餘秒數（HUD 顯示）
  isBossWave: boolean
  damageDir: number        // 受擊方向（相對玩家朝向的角度，rad）；用 damageDirAt 計時顯示
  damageDirAt: number
  metaCoins: number
  board: { score: number; wave: number; date: string }[]
  runCoins: number         // 本場結束獲得的 meta 金幣
  grenades: number         // 手榴彈攜帶數
  ultCharge: number        // 大絕充能（秒，0~maxCharge）
  ultActive: boolean       // 大絕（時間緩慢）啟動中
  dogAlive: boolean        // 是否至少有一隻軍犬存活
  dogHp: number            // 存活軍犬血量總和
  dogMax: number           // 存活軍犬血量上限總和
  dogCount: number         // 存活軍犬數量
  dogLv: Record<DogUpgradeKind, number>   // 軍犬升級等級（本場）
  dogMode: DogMode         // 軍犬指令模式（V 鍵切換）
  grenadeKind: GrenadeKind // 目前手榴彈彈種（T 鍵切換）
  weaponMods: Record<WeaponModKind, boolean>   // 武器改造（本場一次性購買）
}

export function createGameState(): GameState {
  return {
    phase: 'loading', hp: 100, maxHp: 100, armor: 0, money: 0, weaponName: '', ammoMag: 0, ammoReserve: 0,
    reloading: false, aiming: false, wave: 0, enemiesLeft: 0, kills: 0, score: 0, streak: 0,
    bestStreak: 0, hitMarker: 0, headshotMarker: 0, damageFlash: 0, message: '', owned: [], current: 'pistol', loadPct: 0,
    floats: [],
    difficulty: 'normal', frenzyT: 0, isBossWave: false, damageDir: 0, damageDirAt: 0,
    metaCoins: 0, board: [], runCoins: 0, grenades: 0, ultCharge: 0, ultActive: false,
    dogAlive: false, dogHp: 0, dogMax: DOG.maxHp, dogCount: 0,
    dogLv: { dmg: 0, hp: 0, spd: 0 },
    dogMode: 'follow',
    grenadeKind: 'frag',
    weaponMods: { mag: false, pierce: false, fire: false },
  }
}

export class Game {
  engine: Engine
  scene: Scene
  input: Input
  player!: Player
  map!: GameMap
  effects!: Effects
  weapons!: WeaponSystem
  enemies!: EnemyManager
  pickups!: PickupManager
  grenades!: GrenadeManager
  companions: Companion[] = []   // 軍犬同伴池（最多 DOG.maxCount 隻存活）
  private dogMods = { dmg: 1, hp: 1, spd: 1 }   // 軍犬升級倍率（全體共用，傳參照給 Companion）
  private dogCmd: { mode: DogMode } = { mode: 'follow' }   // 軍犬指令（全體共用參照）
  state: GameState

  private spawnQueue: EnemyId[] = []
  private spawnTimer = 0
  private waveActive = false
  private ready = false
  private floatSeq = 0
  private diffCountMult = 1
  private diffReward = 1
  private diffBase = { hp: 1, dmg: 1, spd: 1 }   // 難度基準倍率（波次成長疊乘在上）
  private grenadeCd = 0
  private killAccum = 0    // 累積擊殺數（達 killsPerStep 充能一次大絕）
  touchMode = false        // 觸控裝置（手機 / ?touch）：不請求指標鎖定，改用虛擬搖桿

  constructor(canvas: HTMLCanvasElement, state: GameState) {
    this.state = state
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true)
    this.scene = new Scene(this.engine)
    this.scene.collisionsEnabled = true
    this.scene.gravity = new Vector3(0, -0.5, 0)
    this.scene.clearColor = new Color4(0.45, 0.55, 0.68, 1)
    this.scene.fogMode = Scene.FOGMODE_LINEAR
    this.scene.fogColor = new Color3(0.45, 0.55, 0.68)
    this.scene.fogStart = 70; this.scene.fogEnd = 160
    this.input = new Input(canvas)
  }

  async init() {
    const s = this.scene
    // 光照
    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.2), s)
    hemi.intensity = 0.85
    hemi.groundColor = new Color3(0.35, 0.35, 0.4)
    const dir = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.4), s)
    dir.intensity = 1.0
    dir.position = new Vector3(40, 60, 40)

    const glow = new GlowLayer('glow', s)
    glow.intensity = 0.7

    this.state.loadPct = 10
    this.player = new Player(s, this.input)
    this.player.onDamage = () => { this.state.damageFlash = performance.now() }
    this.player.onDeath = () => this.gameOver()

    this.effects = new Effects(s)
    this.map = new GameMap(s)
    await this.map.build()
    this.state.loadPct = 55

    this.enemies = new EnemyManager(
      s, this.player, this.map,
      (dmg, from) => { this.player.takeDamage(dmg); if (from) this.registerDamageFrom(from) },
      (e, head) => this.onKill(e, head),
    )
    this.enemies.onDamage = (point, amount, isHead) =>
      this.addFloat(point, String(Math.round(amount)), isHead ? '#ff5b5b' : '#ffffff', isHead)
    this.enemies.onBomberExplode = (pos, radius, dmg) => this.bomberExplode(pos, radius, dmg)
    this.enemies.onEnemyShot = (from, to) => this.effects.enemyTracer(from, to)
    await this.enemies.preload()

    this.pickups = new PickupManager(s, this.player, (kind) => this.collect(kind))
    await this.pickups.preload()

    this.grenades = new GrenadeManager(s, this.map, (pos, kind) => this.grenadeExplode(pos, kind))
    await this.grenades.preload()

    // 軍犬：找怪咬怪；並登記為敵人的引怪目標（可購買多隻，敵人各自追最近的一隻）
    await Companion.preload(s)
    this.enemies.getCompanionTarget = (pos) => this.nearestCompanion(pos)
    this.state.loadPct = 80

    this.weapons = new WeaponSystem(
      s, this.player, this.input, this.effects,
      (o, d, r) => this.resolveHit(o, d, r),
      (m, dmg, hm, pt) => this.onWeaponHit(m, dmg, hm, pt),
    )
    this.weapons.onAmmoChange = () => this.syncWeaponHud()
    this.weapons.onWeaponChange = () => this.syncWeaponHud()
    await this.weapons.init()
    this.state.loadPct = 100

    // 失去指標鎖定（按 Esc）→ 暫停；事件驅動，避免啟動時的鎖定競態
    this.input.onLockLost = () => { if (this.state.phase === 'playing') this.pause() }
    // 遊玩中若未鎖定（鎖定意外掉失），點擊畫面重新鎖定
    const canvas = this.engine.getRenderingCanvas()
    canvas?.addEventListener('mousedown', () => {
      if (!this.touchMode && this.state.phase === 'playing' && !this.input.locked) this.input.requestLock()
    })

    this.ready = true
    this.state.phase = 'menu'

    // 主迴圈
    this.engine.resize()
    this.engine.runRenderLoop(() => this.frame())
    window.addEventListener('resize', () => this.engine.resize())
    if (import.meta.env.DEV) (window as any).__ds = this
  }

  // ---- 命中解析（hitscan）：敵人受擊盒 + 世界碰撞 ----
  private resolveHit(origin: Vector3, dir: Vector3, range: number) {
    const ray = new Ray(origin, dir, range)
    const pick = this.scene.pickWithRay(ray, (m: AbstractMesh) =>
      m.isPickable && !!(m.metadata && (m.metadata.enemyRef || m.metadata.world || m.metadata.barrel)),
    )
    if (pick && pick.hit && pick.pickedPoint) {
      return { point: pick.pickedPoint, normal: pick.getNormal(true) || Vector3.Up(), mesh: pick.pickedMesh! }
    }
    return null
  }

  // ---- 武器命中分派：敵人 or 爆炸桶 ----
  private onWeaponHit(mesh: AbstractMesh, dmg: number, headMult: number, point: Vector3) {
    if (mesh.metadata?.enemyRef) {
      this.enemies.damageMesh(mesh, dmg, headMult, point)
      // 燃燒彈頭改造：命中點燃，3 秒內追加 40% 燒傷
      if (this.state.weaponMods.fire) (mesh.metadata.enemyRef as Enemy).ignite(3, dmg * 0.4)
    } else if (mesh.metadata?.barrel) this.damageBarrel(mesh.metadata.barrel, dmg)
  }

  private damageBarrel(barrel: any, dmg: number) {
    if (barrel.exploded) return
    barrel.hp -= dmg
    if (barrel.hp <= 0) this.explodeBarrel(barrel)
  }

  private explodeBarrel(barrel: any) {
    if (barrel.exploded) return
    barrel.exploded = true
    const R = 6.5, maxDmg = 95
    const pos: Vector3 = barrel.pos
    this.effects.blast(pos, R)
    SFX.explode()
    // 隱藏視覺 + 移除碰撞
    barrel.holder.setEnabled(false)
    barrel.collider.isPickable = false
    barrel.collider.checkCollisions = false
    barrel.collider.setEnabled(false)
    // 範圍傷害（敵人 + 玩家）
    this.enemies.explodeDamage(pos, R, maxDmg)
    const pd = Vector3.Distance(this.player.position, pos)
    if (pd < R && this.player.alive) {
      this.player.takeDamage(maxDmg * 0.7 * (1 - pd / R))
      this.registerDamageFrom(pos)
      this.player.addShake(0.8)
    } else if (pd < R * 2) {
      this.player.addShake(0.4 * (1 - pd / (R * 2)))
    }
    this.addFloat(pos.add(new Vector3(0, 1.5, 0)), 'BOOM!', '#ff7a00', true)
    // 連鎖引爆鄰近桶
    for (const b of this.map.barrels) {
      if (!b.exploded && Vector3.Distance(b.pos, pos) < R + 1) {
        setTimeout(() => this.explodeBarrel(b), 110 + Math.random() * 120)
      }
    }
  }

  // ---- 自爆兵引爆 ----
  private bomberExplode(pos: Vector3, radius: number, dmg: number) {
    this.effects.blast(pos, radius)
    SFX.explode()
    const pd = Vector3.Distance(this.player.position, pos)
    if (pd < radius && this.player.alive) {
      this.player.takeDamage(dmg * (1 - pd / radius))
      this.registerDamageFrom(pos)
      this.player.addShake(0.6)
    } else if (pd < radius * 1.8) {
      this.player.addShake(0.3 * (1 - pd / (radius * 1.8)))
    }
    for (const dog of this.companions) {
      if (!dog.alive) continue
      const dd = Vector3.Distance(dog.position, pos)
      if (dd < radius) dog.hurt(dmg * (1 - dd / radius))
    }
    this.addFloat(pos.add(new Vector3(0, 1.4, 0)), '💥', '#ff7a00', true)
  }

  // ---- 手榴彈爆炸：依彈種分派效果 ----
  private grenadeExplode(pos: Vector3, kind: GrenadeKind = 'frag') {
    const R = GRENADE.radius
    this.effects.blast(pos, kind === 'fire' ? R * 0.7 : R)
    SFX.explode()

    if (kind === 'frag') {
      // 破片：全額範圍傷害 + 自傷 + 連鎖引爆
      this.enemies.explodeDamage(pos, R, GRENADE.damage)
      const pd = Vector3.Distance(this.player.position, pos)
      if (pd < R && this.player.alive) {
        const selfDmg = Math.min(GRENADE.selfDmgMax, GRENADE.damage * GRENADE.playerDmgFactor * (1 - pd / R))
        this.player.takeDamage(selfDmg)
        this.registerDamageFrom(pos)
        this.player.addShake(0.7)
      } else if (pd < R * 2) {
        this.player.addShake(0.35 * (1 - pd / (R * 2)))
      }
      this.addFloat(pos.add(new Vector3(0, 1.5, 0)), 'BOOM!', '#ff7a00', true)
    } else if (kind === 'fire') {
      // 燃燒：直傷少，留下火海持續燒（只燒敵人）
      const fx = GRENADE_FX.fire
      this.enemies.explodeDamage(pos, R * 0.7, GRENADE.damage * fx.directFactor)
      this.addZone(pos, fx.zoneRadius, fx.zoneDuration, new Color3(1, 0.35, 0.05), 0.3, fx.zoneDps)
      this.addFloat(pos.add(new Vector3(0, 1.5, 0)), '🔥 火海!', '#ff5b30', true)
    } else if (kind === 'ice') {
      // 冰凍：中等直傷 + 大範圍減速
      const fx = GRENADE_FX.ice
      this.enemies.explodeDamage(pos, R, GRENADE.damage * fx.directFactor)
      this.enemies.slowInRadius(pos, R, fx.slowDuration, fx.slowFactor)
      this.addZone(pos, R * 0.8, 0.9, new Color3(0.3, 0.75, 1), 0.35, 0)
      this.addFloat(pos.add(new Vector3(0, 1.5, 0)), '❄️ 冰凍!', '#54c8ff', true)
    } else {
      // 吸引：把敵人拉成一坨 + 小直傷（配合另一顆破片收割）
      const fx = GRENADE_FX.magnet
      this.enemies.pullToward(pos, R * fx.pullRadiusMult, fx.pullFrac)
      this.enemies.explodeDamage(pos, R * 0.6, GRENADE.damage * fx.directFactor)
      this.addZone(pos, R * 0.7, 0.6, new Color3(0.75, 0.5, 1), 0.35, 0)
      this.addFloat(pos.add(new Vector3(0, 1.5, 0)), '🧲 吸引!', '#c084fc', true)
    }

    // 引爆範圍內的爆炸桶（連鎖）：破片 / 燃燒才會
    if (kind === 'frag' || kind === 'fire') {
      for (const b of this.map.barrels) {
        if (!b.exploded && Vector3.Distance(b.pos, pos) < R) {
          setTimeout(() => this.explodeBarrel(b), 80 + Math.random() * 120)
        }
      }
    }
  }

  // ---- 地面效果區（火海等）：半透明色盤 + 週期傷害 ----
  private zones: { mesh: AbstractMesh; mat: StandardMaterial; pos: Vector3; r: number; t: number; dur: number; tick: number; dps: number; alpha: number }[] = []

  private addZone(pos: Vector3, r: number, dur: number, color: Color3, alpha: number, dps: number) {
    const mesh = MeshBuilder.CreateDisc('zone', { radius: r, tessellation: 40 }, this.scene)
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(pos.x, 0.06, pos.z)
    mesh.isPickable = false
    const mat = new StandardMaterial('zoneMat', this.scene)
    mat.emissiveColor = color
    mat.diffuseColor = new Color3(0, 0, 0)
    mat.disableLighting = true
    mat.alpha = alpha
    mesh.material = mat
    this.zones.push({ mesh, mat, pos: pos.clone(), r, t: dur, dur, tick: 0.25, dps, alpha })
  }

  private updateZones(dt: number) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]
      z.t -= dt
      if (z.dps > 0) {
        z.tick -= dt
        if (z.tick <= 0) { z.tick = 0.5; this.enemies.explodeDamage(z.pos, z.r, z.dps * 0.5) }
      }
      // 淡出（最後 0.6 秒）
      z.mat.alpha = z.alpha * Math.max(0, Math.min(1, z.t / 0.6))
      if (z.t <= 0) { z.mesh.dispose(); this.zones.splice(i, 1) }
    }
  }

  private clearZones() {
    for (const z of this.zones) z.mesh.dispose()
    this.zones.length = 0
  }

  // ---- 受擊方向（給 HUD 邊緣指示器）----
  private registerDamageFrom(pos: Vector3) {
    const dx = pos.x - this.player.position.x
    const dz = pos.z - this.player.position.z
    this.state.damageDir = Math.atan2(dx, dz) - this.player.yaw
    this.state.damageDirAt = performance.now()
  }

  // ---- 拾取掉落物 ----
  private floatAtPlayer(text: string, color: string) {
    const cam = this.scene.activeCamera!
    this.addFloat(this.player.position.add(cam.getForwardRay().direction.scale(4)), text, color, true)
  }
  private collect(kind: PickupKind) {
    if (kind === 'heal') { this.player.heal(DROP.healAmount); this.floatAtPlayer(`+${DROP.healAmount} HP`, '#7CFC58') }
    else if (kind === 'ammo') { this.weapons.refillAmmo(); this.floatAtPlayer('彈藥補給', '#ffcc00') }
    else if (kind === 'frenzy') { this.player.grantFrenzy(DROP.frenzyDuration); this.floatAtPlayer('狂暴啟動!', '#ff3b30') }
    this.syncWeaponHud()
  }

  // ---- 螢幕飄字（傷害數字 / 擊殺獎勵）----
  private worldToScreen(p: Vector3): { x: number; y: number; visible: boolean } {
    const canvas = this.engine.getRenderingCanvas()!
    let w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) { w = this.engine.getRenderWidth(); h = this.engine.getRenderHeight() } // 佈局未就緒時退回 backbuffer 尺寸
    const cam = this.scene.activeCamera!
    const v = Vector3.Project(p, Matrix.Identity(), this.scene.getTransformMatrix(), cam.viewport.toGlobal(w, h))
    return { x: v.x, y: v.y, visible: v.z > 0 && v.z < 1 }
  }

  private addFloat(world: Vector3, text: string, color: string, big = false) {
    const s = this.worldToScreen(world)
    if (!s.visible) return
    this.state.floats.push({ id: this.floatSeq++, x: Math.round(s.x), y: Math.round(s.y), text, color, born: performance.now(), big })
    if (this.state.floats.length > 40) this.state.floats.shift()
  }

  private cleanupFloats() {
    const now = performance.now()
    const f = this.state.floats
    for (let i = f.length - 1; i >= 0; i--) if (now - f[i].born > 900) f.splice(i, 1)
  }

  // ================= 狀態流程 =================
  start(difficulty: Difficulty = 'normal') {
    initAudio()
    // 難度
    this.state.difficulty = difficulty
    const diff = DIFFICULTIES[difficulty]
    this.diffBase = { hp: diff.enemyHp, dmg: diff.enemyDmg, spd: diff.enemySpeed }
    this.enemies.diff = { ...this.diffBase }
    this.diffCountMult = diff.count
    this.diffReward = diff.reward
    // meta 永久加成
    const b = Meta.bonuses()
    this.player.maxHp = b.maxHp
    this.player.speedMult = b.speedMult
    this.player.damageMult = b.damageMult
    this.player.spawn(new Vector3(0, PLAYER.height, -40))
    this.player.armor = Math.max(100, b.armor)   // 預設開局護甲全滿
    this.player.money = ECONOMY.startMoney + b.startMoney
    this.state.money = this.player.money
    this.state.maxHp = this.player.maxHp
    this.state.armor = Math.round(this.player.armor)
    this.state.kills = 0; this.state.score = 0; this.state.streak = 0; this.state.bestStreak = 0
    this.state.runCoins = 0
    this.weapons.owned = ['knife', 'pistol']
    this.weapons.magMult = 1
    this.weapons.pierce = 0
    this.state.weaponMods = { mag: false, pierce: false, fire: false }
    this.weapons.refillAmmo()
    this.weapons.equip('pistol')
    this.enemies.reset()
    this.pickups.clear()
    this.grenades.clear()
    for (const dog of this.companions) dog.clear()
    this.state.dogAlive = false
    this.state.dogHp = 0
    this.state.dogCount = 0
    this.state.dogLv = { dmg: 0, hp: 0, spd: 0 }
    this.dogMods.dmg = 1; this.dogMods.hp = 1; this.dogMods.spd = 1
    this.dogCmd.mode = 'follow'
    this.state.dogMode = 'follow'
    this.grenadeCd = 0
    this.state.grenades = GRENADE.start
    this.state.grenadeKind = 'frag'
    this.clearZones()
    this.state.ultCharge = 0
    this.state.ultActive = false
    this.killAccum = 0
    this.state.floats.length = 0
    this.state.wave = 0
    this.beginWave(1)
    this.state.phase = 'playing'
    this.lockPointer()
  }

  // 觸控模式不鎖指標（讓虛擬搖桿/按鈕可被點擊）；桌機鍵鼠才鎖
  private lockPointer() { if (!this.touchMode) this.input.requestLock() }

  private beginWave(wave: number) {
    // 進入新一波補充手榴彈（第 1 波用起始量，不額外補）
    if (wave > 1) this.state.grenades = Math.min(GRENADE.max, this.state.grenades + GRENADE.refillPerWave)
    for (const dog of this.companions) if (dog.alive) dog.healToFull()   // 軍犬每波回滿血
    // 隨波數成長：敵人越後面越強（血量 +12%/波、傷害 +7%/波、速度 +2%/波 上限 1.5），疊乘在難度基準上
    const hpScale = 1 + (wave - 1) * 0.12
    const dmgScale = 1 + (wave - 1) * 0.07
    const spdScale = Math.min(1.5, 1 + (wave - 1) * 0.02)
    this.enemies.diff = {
      hp: this.diffBase.hp * hpScale,
      dmg: this.diffBase.dmg * dmgScale,
      spd: this.diffBase.spd * spdScale,
    }
    this.state.wave = wave
    const spec = waveSpec(wave)
    this.state.isBossWave = spec.boss
    this.spawnQueue = []
    if (spec.boss) {
      const bossCount = spec.types.filter((t) => t === 'boss').length || 1
      for (let i = 0; i < bossCount; i++) this.spawnQueue.push('boss')
      const adds = Math.max(0, Math.round((spec.count - bossCount) * this.diffCountMult))
      for (let i = 0; i < adds; i++) this.spawnQueue.push(i % 2 === 0 ? 'grunt' : 'rusher')
    } else {
      const count = Math.max(1, Math.round(spec.count * this.diffCountMult))
      for (let i = 0; i < count; i++) this.spawnQueue.push(spec.types[i % spec.types.length])
    }
    // 洗牌
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]]
    }
    this.spawnTimer = 0.5
    this.waveActive = true
    this.weapons.refillAmmo()
    const msg = spec.boss ? `⚠ 王波 — 第 ${wave} 波` : `第 ${wave} 波`
    this.state.message = msg
    SFX.waveStart()
    setTimeout(() => { if (this.state.message === msg) this.state.message = '' }, 1800)
    this.updateEnemyHud()
  }

  private concurrentCap() { return waveSpec(this.state.wave).concurrent }

  private onKill(_e: Enemy, isHead: boolean) {
    this.state.kills++
    this.state.streak++
    // 大絕充能：每殺 killsPerStep 隻 +chargePerStep 秒（上限 maxCharge）
    if (++this.killAccum >= ULTIMATE.killsPerStep) {
      this.killAccum = 0
      this.state.ultCharge = Math.min(ULTIMATE.maxCharge, this.state.ultCharge + ULTIMATE.chargePerStep)
    }
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak)
    const reward = Math.round((_e.def.reward + (isHead ? ECONOMY.headshotBonus : 0) + this.state.streak * ECONOMY.killBonusStreak) * this.diffReward)
    this.player.money += reward
    this.state.money = this.player.money
    this.state.score += Math.round((_e.def.reward + (isHead ? 150 : 0)) * this.diffReward)
    this.state.hitMarker = performance.now()
    if (isHead) { this.state.headshotMarker = performance.now(); SFX.headshot() } else SFX.hit()
    // 擊殺獎勵飄字
    const top = _e.inst.holder.position.add(new Vector3(0, _e.def.boss ? 4 : 2, 0))
    this.addFloat(top, `+$${reward}`, '#7CFC58', true)
    if (isHead) this.addFloat(_e.inst.holder.position.add(new Vector3(0, 2.4, 0)), '爆頭!', '#ff3b30', true)
    if (_e.def.boss) this.addFloat(top.add(new Vector3(0, 0.6, 0)), '擊敗王!', '#ffcc00', true)

    // 掉落物
    const dropPos = _e.inst.holder.position.clone(); dropPos.y = 0
    if (_e.def.boss) {
      this.pickups.spawn('heal', dropPos)
      this.pickups.spawn('frenzy', dropPos.add(new Vector3(1.6, 0, 0)))
    } else {
      // 連殺越高掉寶率越高（每殺 +6%，上限 ×3；封頂 90% 保留一點懸念）
      const streakMult = Math.min(DROP.streakBonusCap, 1 + this.state.streak * DROP.streakBonusPer)
      if (Math.random() < Math.min(0.9, DROP.chance * streakMult)) {
        const r = Math.random()
        const kind: PickupKind = r < 0.5 ? 'heal' : r < 0.82 ? 'ammo' : 'frenzy'
        this.pickups.spawn(kind, dropPos)
      }
    }

    // 連殺獎勵
    const st = this.state.streak
    if (st === KILLSTREAK.heal) { this.player.heal(KILLSTREAK.healAmount); this.floatAtPlayer(`連殺 +${KILLSTREAK.healAmount}HP`, '#7CFC58') }
    else if (st === KILLSTREAK.frenzy) { this.player.grantFrenzy(DROP.frenzyDuration); this.floatAtPlayer('連殺狂暴!', '#ff3b30') }
    else if (st === KILLSTREAK.supply) { this.weapons.refillAmmo(); this.floatAtPlayer('彈藥全補!', '#ffcc00') }

    this.updateEnemyHud()
  }

  private updateEnemyHud() {
    this.state.enemiesLeft = this.enemies.aliveCount + this.spawnQueue.length
  }

  private gameOver() {
    this.state.phase = 'dead'
    this.state.ultActive = false
    this.state.message = ''
    SFX.gameOver()
    this.input.exitLock()
    this.state.runCoins = Meta.endRun(this.state.score, this.state.wave)
    this.state.metaCoins = Meta.coins
    this.state.board = [...Meta.board]
  }

  // ---- 購買 ----
  buy(id: WeaponId): boolean {
    const def = WEAPONS[id]
    if (this.weapons.owned.includes(id)) {
      // 已擁有 → 補滿彈藥（半價）
      const cost = Math.floor(def.price * 0.4)
      if (this.player.money < cost || def.melee) return false
      this.player.money -= cost
      this.weapons.refillAmmo()
    } else {
      if (this.player.money < def.price) return false
      this.player.money -= def.price
      this.weapons.giveWeapon(id, true)
    }
    this.state.money = this.player.money
    SFX.buy()
    this.syncWeaponHud()
    return true
  }

  // 護甲：可疊加，每件 +100 無上限；count 批量購買（'max' = 錢包買好買滿）
  buyArmor(count: number | 'max' = 1): boolean {
    const price = 650
    const afford = Math.floor(this.player.money / price)
    const n = Math.min(count === 'max' ? afford : count, afford)
    if (n <= 0) return false
    this.player.money -= price * n
    this.player.armor += 100 * n
    this.state.money = this.player.money
    this.state.armor = Math.round(this.player.armor)
    SFX.buy()
    return true
  }

  // 存活軍犬數
  private dogAliveCount(): number {
    let n = 0
    for (const dog of this.companions) if (dog.alive) n++
    return n
  }

  // 取離指定位置最近的存活軍犬（給敵人引怪用）
  private nearestCompanion(pos: Vector3): Companion | null {
    let best: Companion | null = null
    let bestD = Infinity
    for (const dog of this.companions) {
      if (!dog.alive) continue
      const d = Vector3.DistanceSquared(dog.position, pos)
      if (d < bestD) { bestD = d; best = dog }
    }
    return best
  }

  // 建立一隻軍犬實例（共用回呼），或回收一隻已死亡的來重生，避免實例無限增長
  private acquireCompanion(): Companion {
    for (const dog of this.companions) if (!dog.alive) return dog
    const dog: Companion = new Companion(
      this.scene, this.player, this.map,
      (pos, range) => this.pickDogTarget(dog, pos, range),
      (e, dmg) => this.enemies.biteDamage(e, dmg),
      this.dogMods,
      this.dogCmd,
    )
    this.companions.push(dog)
    return dog
  }

  // 軍犬選目標（目標分散）：距離 + 同伴鎖定懲罰，讓狗群自動分頭咬不同敵人。
  // 每有一隻同伴鎖定同一敵人 +8 等效距離；自己原本的目標 -6（黏性，避免抖動換目標）。
  private pickDogTarget(self: Companion, pos: Vector3, range: number): Enemy | null {
    const claims = new Map<Enemy, number>()
    for (const d of this.companions) {
      if (d === self || !d.alive || !d.curTarget) continue
      claims.set(d.curTarget, (claims.get(d.curTarget) || 0) + 1)
    }
    let best: Enemy | null = null
    let bestScore = range
    for (const e of this.enemies.alive) {
      if (e.state === 'dead') continue
      const dist = Vector3.Distance(e.inst.holder.position, pos)
      if (dist >= range) continue   // 只考慮實際在找怪範圍內的敵人
      const score = dist + (claims.get(e) || 0) * 8 - (e === self.curTarget ? 6 : 0)
      if (score < bestScore) { bestScore = score; best = e }
    }
    // 保底：敵人少、同伴懲罰疊太高時（例如全場只剩 1 隻怪），退回攻擊最近的敵人，不讓狗發呆
    return best ?? this.enemies.nearestEnemy(pos, range)
  }

  // 軍犬：同時最多 DOG.maxCount 隻，死掉可再買。在玩家前方附近生成（多隻散開）。
  buyDog(): boolean {
    if (this.dogAliveCount() >= DOG.maxCount || this.player.money < DOG.price) return false
    this.player.money -= DOG.price
    const cam = this.player.camera
    const fwd = cam.getForwardRay().direction
    const base = new Vector3(fwd.x, 0, fwd.z).normalize().scale(2.5)
    // 依目前數量在玩家周圍散開，避免完全重疊
    const ang = this.dogAliveCount() * 0.7
    const off = new Vector3(Math.cos(ang), 0, Math.sin(ang)).scale(1.2)
    const spawn = this.player.position.add(base).add(off)
    this.acquireCompanion().spawn(new Vector3(spawn.x, 0, spawn.z))
    this.state.money = this.player.money
    SFX.buy()
    return true
  }

  // 武器改造：一次性購買，本場有效，作用於全部武器
  buyWeaponMod(kind: WeaponModKind): boolean {
    if (this.state.weaponMods[kind]) return false
    const def = WEAPON_MODS[kind]
    if (this.player.money < def.price) return false
    this.player.money -= def.price
    this.state.weaponMods[kind] = true
    if (kind === 'mag') { this.weapons.magMult = 1.5; this.weapons.refillAmmo() }
    else if (kind === 'pierce') this.weapons.pierce = 1
    // fire 在 onWeaponHit 判定
    this.state.money = this.player.money
    SFX.buy()
    this.syncWeaponHud()
    return true
  }

  // 軍犬升級：全體軍犬共用倍率，本場有效，價格隨等級遞增
  buyDogUpgrade(kind: DogUpgradeKind): boolean {
    const def = DOG_UPGRADES[kind]
    const lv = this.state.dogLv[kind]
    if (lv >= def.max) return false
    const cost = def.baseCost * (lv + 1)
    if (this.player.money < cost) return false
    this.player.money -= cost
    this.state.dogLv[kind] = lv + 1
    this.dogMods[kind] = 1 + (lv + 1) * def.perLevel
    if (kind === 'hp') for (const dog of this.companions) dog.healToFull()   // 升血量順便回滿
    this.state.money = this.player.money
    SFX.buy()
    return true
  }

  // 補血包：可疊加購買；溢出提升血量上限。count 批量購買（'max' = 錢包買好買滿）
  buyMedkit(count: number | 'max' = 1): boolean {
    const afford = Math.floor(this.player.money / MEDKIT.price)
    const n = Math.min(count === 'max' ? afford : count, afford)
    if (n <= 0) return false
    this.player.money -= MEDKIT.price * n
    this.player.hp += MEDKIT.heal * n
    if (this.player.hp > this.player.maxHp) this.player.maxHp = this.player.hp
    this.state.maxHp = this.player.maxHp
    this.state.money = this.player.money
    this.state.hp = Math.round(this.player.hp)
    SFX.buy()
    return true
  }

  nextWave() {
    if (this.state.phase !== 'buy') return
    this.beginWave(this.state.wave + 1)
    this.state.phase = 'playing'
    this.lockPointer()
  }

  pause() {
    if (this.state.phase !== 'playing') return
    this.state.phase = 'paused'
    this.input.exitLock()
  }

  resume() {
    if (this.state.phase === 'paused') {
      this.state.phase = 'playing'
      this.lockPointer()
    }
  }

  private syncWeaponHud() {
    this.state.weaponName = this.weapons.weaponName
    this.state.ammoMag = this.weapons.ammoMag
    this.state.ammoReserve = this.weapons.ammoReserve
    this.state.owned = [...this.weapons.owned]
    this.state.current = this.weapons.current
  }

  // ================= 每幀 =================
  private frame() {
    if (!this.ready) return
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05)
    const phase = this.state.phase

    if (phase === 'playing') {
      if (this.grenadeCd > 0) this.grenadeCd -= dt
      if (this.input.justPressed('KeyG')) this.tryThrowGrenade()
      if (this.input.justPressed('KeyF')) this.toggleUltimate()
      if (this.input.justPressed('KeyV')) this.cycleDogMode()
      if (this.input.justPressed('KeyT')) this.cycleGrenadeKind()
      // 大絕時間緩慢：世界用縮放 dt，玩家/武器維持真實 dt（消耗以真實時間計）
      let slowF = 1
      if (this.state.ultActive) {
        this.state.ultCharge = Math.max(0, this.state.ultCharge - dt)
        if (this.state.ultCharge <= 0) this.endUltimate()
        else slowF = ULTIMATE.slowFactor
      }
      const wdt = dt * slowF
      this.player.update(dt)
      this.weapons.update(dt)
      this.enemies.update(wdt)
      this.pickups.update(wdt)
      this.grenades.update(wdt)
      this.updateZones(wdt)
      for (const dog of this.companions) dog.update(dt)   // 軍犬（同伴）維持全速，不受大絕時間縮放
      this.effects.update(wdt)
      this.tickWave(dt)
      this.syncStatusHud()
    } else {
      // 非遊玩仍渲染 + 更新特效淡出
      this.effects.update(dt)
    }

    this.cleanupFloats()
    this.input.endFrame()
    this.scene.render()
  }

  private tryThrowGrenade() {
    if (this.grenadeCd > 0 || this.state.grenades <= 0 || !this.player.alive) return
    this.state.grenades--
    this.grenadeCd = GRENADE.cooldown
    const cam = this.player.camera
    const dir = cam.getForwardRay().direction.normalize()
    const origin = cam.position.add(dir.scale(0.8))
    this.grenades.throw(origin, dir, this.state.grenadeKind)
    SFX.throwGrenade()
  }

  // ---- 手榴彈彈種：T 鍵循環 破片 → 燃燒 → 冰凍 → 吸引 ----
  private cycleGrenadeKind() {
    const order: GrenadeKind[] = ['frag', 'fire', 'ice', 'magnet']
    const next = order[(order.indexOf(this.state.grenadeKind) + 1) % order.length]
    this.state.grenadeKind = next
    const k = GRENADE_KINDS[next]
    this.floatAtPlayer(`手榴彈：${k.icon} ${k.name}彈`, '#ffcc66')
  }

  // ---- 軍犬指令：V 鍵循環 跟隨 → 駐守 → 出擊 ----
  private cycleDogMode() {
    const order: DogMode[] = ['follow', 'guard', 'attack']
    const names: Record<DogMode, string> = { follow: '🐕 跟隨', guard: '🛡 駐守', attack: '⚔ 出擊' }
    const next = order[(order.indexOf(this.dogCmd.mode) + 1) % order.length]
    this.dogCmd.mode = next
    this.state.dogMode = next
    this.floatAtPlayer(`軍犬指令：${names[next]}`, '#fbbf24')
  }

  // ---- 大絕：時間緩慢 ----
  private toggleUltimate() {
    if (this.state.ultActive) { this.endUltimate(); return }     // 再按一次可提前結束、保留剩餘充能
    if (this.state.ultCharge < ULTIMATE.minActivate) return
    this.state.ultActive = true
    SFX.ultStart()
  }

  private endUltimate() {
    if (!this.state.ultActive) return
    this.state.ultActive = false
    SFX.ultEnd()
  }

  private tickWave(dt: number) {
    if (!this.waveActive) return
    // 持續生成直到佇列清空
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt
      if (this.spawnTimer <= 0 && this.enemies.aliveCount < this.concurrentCap()) {
        const id = this.spawnQueue.shift()!
        const sp = this.map.spawnPoints[Math.floor(Math.random() * this.map.spawnPoints.length)]
        const pos = sp.clone(); pos.y = 0
        this.enemies.spawn(id, pos)
        this.spawnTimer = 0.6 + Math.random() * 0.6
        this.updateEnemyHud()
      }
    } else if (this.enemies.aliveCount === 0 && this.enemies.pendingDead === 0) {
      // 波次完成
      this.waveActive = false
      this.player.money += ECONOMY.roundReward
      this.state.money = this.player.money
      this.state.message = ''
      this.state.phase = 'buy'
      this.input.exitLock()
      SFX.waveClear()
    }
    this.updateEnemyHud()
  }

  private syncStatusHud() {
    this.state.hp = Math.round(this.player.hp)
    let dogCount = 0, dogHp = 0
    for (const dog of this.companions) if (dog.alive) { dogCount++; dogHp += dog.hp }
    this.state.dogCount = dogCount
    this.state.dogAlive = dogCount > 0
    this.state.dogHp = Math.round(dogHp)
    this.state.dogMax = Math.max(1, dogCount) * DOG.maxHp * this.dogMods.hp
    this.state.armor = Math.round(this.player.armor)
    this.state.reloading = this.weapons.isReloading
    this.state.aiming = this.player.aiming
    this.state.ammoMag = this.weapons.ammoMag
    this.state.ammoReserve = this.weapons.ammoReserve
    this.state.frenzyT = this.player.frenzyT
  }

  dispose() {
    this.input.dispose()
    this.engine.dispose()
  }
}
