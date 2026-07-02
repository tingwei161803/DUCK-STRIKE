// POST /api/run — 提交一場成績到排行榜，並累加全站統計。
import { Ctx, json, clampInt, sanitizeText, verifyTurnstile, rateLimited, DIFFICULTIES } from './_lib'

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon'
  if (await rateLimited(env, 'run:' + ip, 10, 60_000)) return json({ error: 'rate' }, 429)

  let b: any
  try { b = await request.json() } catch { return json({ error: 'bad json' }, 400) }
  if (!(await verifyTurnstile(b.token, env.TURNSTILE_SECRET, ip))) {
    return json({ error: 'turnstile' }, 403)
  }

  const name = sanitizeText(b.name, 16) || '鴨鴨'
  const difficulty = DIFFICULTIES.includes(b.difficulty) ? b.difficulty : 'normal'
  const wave = clampInt(b.wave, 0, 100_000)
  // 合理性夾制：擊殺/分數不得超過波次能達到的理論上限（擋誇張灌榜）
  const killCap = wave * wave * 3 + 150
  const kills = Math.min(clampInt(b.kills, 0, 1_000_000), killCap)
  const score = Math.min(clampInt(b.score, 0, 100_000_000), kills * 4000)
  const deviceId = sanitizeText(b.deviceId, 64)

  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO runs (device_id,name,score,wave,kills,difficulty,created_at) VALUES (?,?,?,?,?,?,?)',
      ).bind(deviceId, name, score, wave, kills, difficulty, Date.now()),
      env.DB.prepare('UPDATE stats SET plays=plays+1, total_kills=total_kills+? WHERE id=1').bind(kills),
    ])
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
