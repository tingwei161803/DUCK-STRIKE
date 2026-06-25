// ============================================================================
// pickups.ts — 掉落物系統（引擎層）：補血 / 彈藥 / 限時狂暴。
// 敵人死亡機率掉落，玩家走近自動拾取。
// ============================================================================
import {
  Scene, Vector3, MeshBuilder, StandardMaterial, Color3, TransformNode, Mesh,
} from '@babylonjs/core'
import { loadModel, instantiateStatic, scaleForHeight, ModelInstance, LoadedModel } from './model-loader'
import { PickupKind, DROP } from './config'
import { Player } from './player'
import { SFX } from './sound'

interface Item {
  kind: PickupKind
  holder: TransformNode
  pos: Vector3
  t: number          // 剩餘壽命
  phase: number      // bob 相位
}

export class PickupManager {
  scene: Scene
  player: Player
  onCollect: (kind: PickupKind) => void
  items: Item[] = []
  private healModel?: LoadedModel
  private healInsts: ModelInstance[] = []

  constructor(scene: Scene, player: Player, onCollect: (kind: PickupKind) => void) {
    this.scene = scene; this.player = player; this.onCollect = onCollect
  }

  async preload() {
    this.healModel = await loadModel(this.scene, '/models/env/health.gltf')
  }

  spawn(kind: PickupKind, pos: Vector3) {
    const holder = new TransformNode('pickup', this.scene)
    holder.position.set(pos.x, 0.6, pos.z)
    if (kind === 'heal' && this.healModel) {
      const inst = instantiateStatic(this.scene, this.healModel, scaleForHeight(this.healModel, 0.6))
      inst.holder.parent = holder
      inst.meshes.forEach((m) => { m.isPickable = false })
      this.healInsts.push(inst)
    } else {
      // 彈藥=黃盒、狂暴=紅球（程序幾何 + 自發光）
      const mesh: Mesh = kind === 'frenzy'
        ? MeshBuilder.CreateSphere('pk', { diameter: 0.5 }, this.scene)
        : MeshBuilder.CreateBox('pk', { width: 0.45, height: 0.35, depth: 0.45 }, this.scene)
      const mat = new StandardMaterial('pkMat', this.scene)
      mat.emissiveColor = kind === 'frenzy' ? new Color3(1, 0.15, 0.15) : new Color3(1, 0.8, 0.1)
      mat.disableLighting = true
      mesh.material = mat
      mesh.isPickable = false
      mesh.parent = holder
    }
    this.items.push({ kind, holder, pos: holder.position.clone(), t: 18, phase: Math.random() * 6 })
  }

  update(dt: number) {
    const px = this.player.position.x, pz = this.player.position.z
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      it.t -= dt
      it.phase += dt * 2.5
      // 旋轉 + 上下浮動
      it.holder.rotation.y += dt * 1.8
      it.holder.position.y = 0.6 + Math.sin(it.phase) * 0.12
      // 拾取判定（2D 距離）
      const dx = it.holder.position.x - px, dz = it.holder.position.z - pz
      if (dx * dx + dz * dz < DROP.pickupRadius * DROP.pickupRadius) {
        this.onCollect(it.kind)
        SFX.pickup()
        this.dispose(it); this.items.splice(i, 1); continue
      }
      if (it.t <= 0) { this.dispose(it); this.items.splice(i, 1) }
    }
  }

  private dispose(it: Item) {
    it.holder.getChildMeshes().forEach((m) => m.dispose())
    it.holder.dispose()
  }

  clear() {
    this.items.forEach((it) => this.dispose(it))
    this.items = []
  }
}
