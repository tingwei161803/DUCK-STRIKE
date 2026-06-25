// ============================================================================
// effects.ts — 打擊感特效（引擎層）：槍口火光、彈道曳光、命中濺射、爆炸。
// 全用物件池避免 GC。
// ============================================================================
import {
  Scene, MeshBuilder, Vector3, Color3, StandardMaterial, Mesh,
  ParticleSystem, Texture, Color4, DynamicTexture,
} from '@babylonjs/core'

export class Effects {
  scene: Scene
  private flash: Mesh
  private flashMat: StandardMaterial
  private flashTimer = 0
  private tracers: { mesh: Mesh; t: number }[] = []
  private sparkTex: Texture

  constructor(scene: Scene) {
    this.scene = scene
    // 火花/火光貼圖（程序生成的柔邊放射狀漸層，避免硬邊方塊）
    this.sparkTex = this.makeSparkTexture()

    // 槍口火光：永遠面向相機的 billboard，柔邊貼圖 + 加色混合（看起來像光不像方塊）
    this.flash = MeshBuilder.CreatePlane('muzzle', { size: 0.35 }, scene)
    this.flashMat = new StandardMaterial('muzzleMat', scene)
    this.flashMat.emissiveColor = new Color3(1, 0.88, 0.5)
    this.flashMat.diffuseColor = new Color3(0, 0, 0)
    this.flashMat.disableLighting = true
    this.flashMat.emissiveTexture = this.sparkTex
    this.flashMat.opacityTexture = this.sparkTex     // 用貼圖 alpha 做柔邊
    this.flashMat.alphaMode = 1                       // ALPHA_ADD（加色，發光感）
    this.flashMat.backFaceCulling = false
    this.flashMat.alpha = 0
    this.flash.material = this.flashMat
    this.flash.billboardMode = Mesh.BILLBOARDMODE_ALL // 永遠正對相機
    this.flash.isPickable = false
    this.flash.renderingGroupId = 1                   // 蓋在視角模型之上
    this.flash.setEnabled(false)
  }

  private makeSparkTexture(): Texture {
    const t = new DynamicTexture('spark', 64, this.scene, false)
    const ctx = t.getContext() as unknown as CanvasRenderingContext2D
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.4, 'rgba(255,200,90,0.9)')
    g.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
    t.hasAlpha = true; t.update()
    return t
  }

  /** 槍口火光：在 pos 顯示一閃即逝的柔光（billboard，加色）。 */
  muzzleFlash(pos: Vector3, _dir: Vector3) {
    this.flash.setEnabled(true)
    this.flash.position.copyFrom(pos)
    this.flashMat.alpha = 1
    this.flash.scaling.setAll(0.7 + Math.random() * 0.5)
    this.flashTimer = 0.05
  }

  /** 彈道曳光：從 from 到 to 畫一條細線，快速淡出。 */
  tracer(from: Vector3, to: Vector3) {
    const dist = Vector3.Distance(from, to)
    const line = MeshBuilder.CreateCylinder('tracer', { height: dist, diameter: 0.03 }, this.scene)
    const mid = from.add(to).scale(0.5)
    line.position.copyFrom(mid)
    line.lookAt(to)
    line.rotate(new Vector3(1, 0, 0), Math.PI / 2)
    const mat = new StandardMaterial('tracerMat', this.scene)
    mat.emissiveColor = new Color3(1, 0.9, 0.5)
    mat.disableLighting = true
    line.material = mat
    line.isPickable = false
    this.tracers.push({ mesh: line, t: 0.08 })
  }

  /** 命中濺射粒子。enemy=血(紅)，否則=火花(黃灰)。 */
  impact(pos: Vector3, normal: Vector3, kind: 'enemy' | 'world') {
    const ps = new ParticleSystem('impact', 24, this.scene)
    ps.particleTexture = this.sparkTex
    ps.emitter = pos.clone()
    ps.minEmitBox = Vector3.Zero(); ps.maxEmitBox = Vector3.Zero()
    if (kind === 'enemy') {
      ps.color1 = new Color4(0.8, 0.05, 0.05, 1); ps.color2 = new Color4(0.5, 0, 0, 1)
    } else {
      ps.color1 = new Color4(1, 0.8, 0.3, 1); ps.color2 = new Color4(0.6, 0.6, 0.6, 1)
    }
    ps.colorDead = new Color4(0, 0, 0, 0)
    ps.minSize = 0.04; ps.maxSize = 0.14
    ps.minLifeTime = 0.1; ps.maxLifeTime = 0.3
    ps.emitRate = 300
    ps.direction1 = normal.add(new Vector3(-0.6, 0.2, -0.6))
    ps.direction2 = normal.add(new Vector3(0.6, 0.8, 0.6))
    ps.minEmitPower = 2; ps.maxEmitPower = 5
    ps.gravity = new Vector3(0, -9, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    ps.start()
    setTimeout(() => { ps.stop(); setTimeout(() => ps.dispose(), 400) }, 60)
  }

  /** 爆炸（爆炸桶）。 */
  explosion(pos: Vector3) {
    const ps = new ParticleSystem('boom', 200, this.scene)
    ps.particleTexture = this.sparkTex
    ps.emitter = pos.clone()
    ps.minEmitBox = new Vector3(-0.3, 0, -0.3); ps.maxEmitBox = new Vector3(0.3, 0.5, 0.3)
    ps.color1 = new Color4(1, 0.7, 0.2, 1); ps.color2 = new Color4(1, 0.3, 0, 1)
    ps.colorDead = new Color4(0.2, 0.1, 0.1, 0)
    ps.minSize = 0.3; ps.maxSize = 1.2
    ps.minLifeTime = 0.2; ps.maxLifeTime = 0.6
    ps.emitRate = 2000
    ps.direction1 = new Vector3(-3, 2, -3); ps.direction2 = new Vector3(3, 6, 3)
    ps.minEmitPower = 3; ps.maxEmitPower = 9
    ps.gravity = new Vector3(0, -6, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    ps.start()
    setTimeout(() => { ps.stop(); setTimeout(() => ps.dispose(), 800) }, 120)
  }

  update(dt: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      this.flashMat.alpha = Math.max(0, this.flashTimer / 0.05) * 0.95
      if (this.flashTimer <= 0) this.flash.setEnabled(false)
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]
      tr.t -= dt
      const m = tr.mesh.material as StandardMaterial
      m.alpha = Math.max(0, tr.t / 0.08)
      if (tr.t <= 0) { tr.mesh.dispose(); this.tracers.splice(i, 1) }
    }
  }
}
