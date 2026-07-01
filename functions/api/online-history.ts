// GET /api/online-history?days=7 — 近 N 天每小時在線峰值（給首頁歷史圖表）。
import { Ctx, json, clampInt } from './_lib'

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const url = new URL(request.url)
  const days = clampInt(url.searchParams.get('days') ?? 7, 1, 30)
  const sinceHour = Math.floor((Date.now() - days * 86_400_000) / 3_600_000)
  try {
    const { results } = await env.DB.prepare(
      'SELECT hour, peak FROM online_hourly WHERE hour >= ? ORDER BY hour ASC',
    ).bind(sinceHour).all<any>()
    return json((results || []).map((r) => ({ hour: r.hour, peak: r.peak })))
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
