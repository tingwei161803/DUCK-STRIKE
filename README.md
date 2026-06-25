# DUCK STRIKE · 鴨鴨突擊

低多邊形第一人稱射擊（FPS）。在競技場中迎戰一波波 AI 敵兵，購買軍火、爆頭連殺、活到最後。
技術棧沿用 [GAME.md](./GAME.md) 的可重用心法：**玩法系統與美術/數值解耦，換皮只換 `public/models/` + 改字串。**

技術：**Vue 3 `<script setup>` + TypeScript + Vite + Tailwind v4 + Babylon.js**。
素材：低多邊形射擊包（角色 Soldier/Enemy/Hazmat + 16 把槍 + 環境掩體），自包 glTF。

## 操作
| 鍵 | 動作 |
|---|---|
| `WASD` | 移動 |
| 滑鼠 | 看視/瞄準 |
| 左鍵 | 射擊（自動武器按住連發） |
| 右鍵 | 瞄準 / 狙擊開鏡 |
| `R` | 換彈 |
| `1`~`5` | 切換武器 / `Q` 軍刀 / 滾輪切換 |
| `Shift` | 奔跑 · `Ctrl`/`C` 蹲下 · `Space` 跳 |
| `B` | 開購買選單 · `Esc` 暫停 |

**手機**：自動偵測觸控裝置並顯示虛擬控制——左下搖桿移動、右側拖曳轉視角、畫面按鈕射擊/瞄準/跳/蹲/換彈/切槍（桌機可用網址加 `?touch` 參數測試）。

## 玩法
- **波次制 + 王波**：每波敵人數與強度遞增（雜兵 → 突擊兵 → 重裝兵 → 自爆兵）；**每 5 波為王波**，登場放大的紫色王（高血、高傷、必掉補給）。
- **敵人種類**：雜兵（遠程）、突擊兵（近身衝刺）、重裝兵（厚血）、**自爆兵**（橘色，貼身引爆範圍傷害）、**王**。
- **命中**：hitscan 射線，含爆頭倍率、掩體遮蔽（LOS）、散布（移動/腰射放大，瞄準收斂）、後座。
- **打擊感**：鏡頭震動（開火/受傷/爆炸）、武器走路晃動 + 轉視角 sway、傷害/金錢飄字、爆頭/擊殺提示、受擊方向指示器。
- **可引爆爆炸桶**：場上爆炸桶/瓦斯桶可射爆，6.5m 範圍依距離遞減傷害、**連鎖引爆**。
- **掉落與強化**：敵人機率掉落 補血 / 彈藥 / **限時狂暴**（傷害×2、射速×1.5）；走過去自動拾取。
- **經濟**：擊殺/爆頭/連殺/過關給錢；波間進「軍火庫」買槍/補彈/護甲。
- **連殺獎勵**：連殺 5 → 回血、10 → 狂暴、15 → 彈藥全補。
- **難度**：簡單 / 普通 / 困難 / 地獄（影響敵人血量、傷害、速度、數量、獎勵倍率）。
- **永久升級（meta）**：每場結束依分數/波次給「★星幣」，主選單可解鎖跨場永久強化（生命/護甲/移速/傷害/起始資金，存 localStorage）。
- **排行榜**：本地 Top 10（主選單 + 死亡結算）。

## 開發
```bash
pnpm install
pnpm dev          # http://localhost:5200
pnpm typecheck    # vue-tsc --noEmit
pnpm build
```

## 架構分層（對應 GAME.md §0）
| 層 | 檔案 | 換新遊戲 |
|---|---|---|
| **引擎層（可重用）** | `game.ts` 主迴圈/命中解析/波次/爆炸/掉落 · `player.ts` FPS 控制器（含震動/狂暴）· `weapons.ts` 武器系統 · `enemies.ts` AI+動畫池（含自爆/王/染色）· `pickups.ts` 掉落物 · `map.ts` 地圖+爆炸桶 · `effects.ts` 打擊特效 · `model-loader.ts` glTF 載入 · `input.ts` 輸入 · `sound.ts` 音效合成 | 幾乎不動 |
| **資料層（每款調）** | `config.ts` 的 `WEAPONS` / `ENEMIES` / `waveSpec` / `DIFFICULTIES` / `DROP` / `KILLSTREAK` / `PLAYER` / `ECONOMY` · `meta.ts` 的 `META_UPGRADES` 永久升級表 | 改資料陣列 |
| **資產層（每款換）** | `public/models/{characters,guns,env}/*.gltf` · `THEME` 文案/配色 · favicon | 換檔 + 改字串 |

### 換皮（reskin）三步
1. 丟新 glTF 進 `public/models/`，改 `config.ts` 的 `model` 字串。
2. 調 `WEAPONS`/`ENEMIES`/`waveSpec` 數值。
3. 改 `THEME` 標題/配色、`index.html` 標題、`favicon.svg`。

## 踩過的坑（已封裝）
- **glTF `__root__` 帶四元數** → 一律包 `TransformNode` holder 再轉（`model-loader.ts`）。
- **骨架動畫單位**用 `AssetContainer.instantiateModelsToScene` 正確複製骨架+動畫池（敵人）。
- **`FreeCamera` 無 `moveWithCollisions`** → 用隱形 collider mesh 做水平碰撞，垂直（跳/蹲）走相機。
- **射擊命中**：環境視覺 mesh 設 `isPickable=false`，改用不可見 box collider，穩定又便宜。
- **單體受擊閃白 / 兵種染色**：per-mesh `renderOverlay` + `overlayColor`（需 `Engine(..., { stencil:true })`）；共用材質不能直接改色，用 overlay 才不會污染同模型的其他單位。
- **視角模型軸向**：素材槍管沿 local +X，需繞 Y 轉 −90° 才朝螢幕內；槍口火光改用「相機相對偏移」而非槍模型節點，與各槍軸向解耦。
- **世界座標→螢幕飄字**：`Vector3.Project` 用 `canvas.clientWidth/Height` 投影對齊 HUD（CSS 像素）；佈局未就緒時退回 `engine.getRenderWidth()` 避免投影出 NaN。
- **指標鎖定競態**：不要每幀輪詢 `pointerLockElement` 來暫停（開局請求鎖定是非同步的會誤判）；改用 `pointerlockchange` 事件，只在「真的失去鎖定」時暫停。

## 待辦（可延伸）
- **全球排行榜**：沿用 GAME.md §5 的 Cloudflare Pages + D1（目前為本地 Top 10，存 localStorage）。
- **盾兵**：正面擋彈、需繞背的敵人（角度判定）。
- 手榴彈投擲、第三人稱切換、更多地圖、王的專屬招式（彈幕/震波）。

## 已完成的主要系統
- 打擊感：鏡頭震動、武器晃動/sway、傷害飄字、受擊方向指示器、可引爆爆炸桶。
- 內容：王波、自爆兵、掉落物（補血/彈藥/狂暴）、限時強化。
- 成長：永久升級（meta 星幣）、連殺獎勵、本地排行榜、4 級難度。
