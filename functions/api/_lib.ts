// ============================================================================
// _lib.ts — Pages Functions 共用：D1 型別 stub（免裝 workers-types）、回應與清洗。
// ============================================================================

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>
}
export interface Env {
  DB: D1Database
  DELETE_KEY?: string        // 留言刪除管理鍵（Pages Secret）
  TURNSTILE_SECRET?: string  // Turnstile 私鑰（Pages Secret）；未設 = 略過驗證
}
export interface Ctx { request: Request; env: Env }

/**
 * 驗證 Turnstile token。安全漸進式：
 * - 未設 TURNSTILE_SECRET → 回 true（尚未啟用，不擋現有流量）
 * - 已設但 token 缺/無效 → 回 false
 */
export async function verifyTurnstile(token: unknown, secret: string | undefined, ip?: string | null): Promise<boolean> {
  if (!secret) return true
  if (!token || typeof token !== 'string') return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set('remoteip', ip)
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    const d = (await r.json()) as { success?: boolean }
    return !!d && d.success === true
  } catch {
    return false
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

/** 去除角括號與控制字元、trim、限長，避免 XSS 與髒資料。 */
export function sanitizeText(v: unknown, maxLen: number): string {
  const raw = String(v ?? '').replace(/[<>]/g, '')
  let out = ''
  for (const ch of raw) {
    const c = ch.charCodeAt(0)
    out += c < 32 || c === 127 ? ' ' : ch   // 控制字元換成空白
  }
  return out.trim().slice(0, maxLen)
}

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'hell']

/**
 * 輕量限流（D1）：同一 key 在 windowMs 內超過 max 次 → 回 true（擋下）。
 * *.pages.dev 無法用 WAF 規則，故在 Function 內以 D1 計數。失敗時放行（不因限流故障擋掉正常玩家）。
 */
export async function rateLimited(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now()
  try {
    const row = await env.DB.prepare('SELECT n, reset FROM ratelimit WHERE k=?').bind(key).first<{ n: number; reset: number }>()
    if (!row || now > row.reset) {
      await env.DB.prepare(
        'INSERT INTO ratelimit (k,n,reset) VALUES (?,1,?) ON CONFLICT(k) DO UPDATE SET n=1, reset=?',
      ).bind(key, now + windowMs, now + windowMs).run()
      return false
    }
    if (row.n >= max) return true
    await env.DB.prepare('UPDATE ratelimit SET n=n+1 WHERE k=?').bind(key).run()
    return false
  } catch {
    return false
  }
}
