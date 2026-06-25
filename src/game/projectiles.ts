// ============================================================================
// projectiles.ts — 王的彈幕系統（引擎層）：發光彈丸池，會飛、撞玩家/掩體。
// ============================================================================
import { Scene, Vector3, MeshBuilder, StandardMaterial, Color3, Mesh } from '@babylonjs/core'
import { Player } from './player'
import { GameMap } from './map'
import { WORLD } from './config'

interface Bullet { mesh: Mesh; vel: Vector3; dmg: number; t: number; active: boolean }

export class BulletManager {
  scene: Scene
  private pool: Bullet[] = []
  private mat: StandardMaterial

  constructor(scene: Scene) {
    this.scene = scene
    this.mat = new StandardMaterial('bossBulletMat', scene)
    this.mat.emissiveColor = new Color3(0.9, 0.25, 1) // 紫紅發光
    this.mat.diffuseColor = new Color3(0, 0, 0)
    this.mat.disableLighting = true
  }

  private make(): Bullet {
    const mesh = MeshBuilder.CreateSphere('bossBullet', { diameter: 0.38, segments: 6 }, this.scene)
    mesh.material = this.mat
    mesh.isPickable = false
    mesh.setEnabled(false)
    const b: Bullet = { mesh, vel: Vector3.Zero(), dmg: 0, t: 0, active: false }
    this.pool.push(b)
    return b
  }

  spawn(pos: Vector3, dir: Vector3, speed: number, dmg: number) {
    const b = this.pool.find((x) => !x.active) || this.make()
    b.active = true
    b.mesh.setEnabled(true)
    b.mesh.position.copyFrom(pos)
    b.vel = dir.normalize().scale(speed)
    b.dmg = dmg
    b.t = 5
  }

  update(dt: number, player: Player, map: GameMap, onHitPlayer: (dmg: number, from: Vector3) => void) {
    for (const b of this.pool) {
      if (!b.active) continue
      b.t -= dt
      b.mesh.position.addInPlace(b.vel.scale(dt))
      const p = b.mesh.position
      // 撞玩家（蹲下可躲過高處彈幕）
      const dx = p.x - player.position.x, dy = p.y - player.position.y, dz = p.z - player.position.z
      if (dx * dx + dy * dy + dz * dz < 0.85 * 0.85 && player.alive) {
        onHitPlayer(b.dmg, p.clone()); this.kill(b); continue
      }
      // 撞掩體 / 出界 / 落地 / 壽命
      if (b.t <= 0 || p.y < 0.2 || Math.abs(p.x) > WORLD.arenaHalf || Math.abs(p.z) > WORLD.arenaHalf || map.blocked(p.x, p.z, 0.3)) {
        this.kill(b)
      }
    }
  }

  private kill(b: Bullet) { b.active = false; b.mesh.setEnabled(false) }
  clear() { this.pool.forEach((b) => this.kill(b)) }
}
