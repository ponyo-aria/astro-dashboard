// 月齢から、月の満ち欠けの形を小さな絵（SVG）で描く。

const SYNODIC_MONTH_DAYS = 29.530588853

/** 月齢（日）から、光っている割合（0〜1）と、満ちていく途中かどうかを求める */
export function moonPhaseShape(moonAgeDays) {
  const angle = ((moonAgeDays / SYNODIC_MONTH_DAYS) * 2 * Math.PI) % (2 * Math.PI)
  return {
    litFraction: (1 - Math.cos(angle)) / 2,
    waxing: moonAgeDays < SYNODIC_MONTH_DAYS / 2,
  }
}

/** 月の形のSVG（文字列）。北半球から見た形（満ちていくときは右側が光る）。 */
export function moonPhaseSvg(moonAgeDays, size = 18) {
  const { litFraction, waxing } = moonPhaseShape(moonAgeDays)
  const r = 10
  const open = `<svg class="moon-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">`
  const disc = `<circle cx="12" cy="12" r="${r}" class="moon-icon-dark"/>`

  if (litFraction < 0.03) return `${open}${disc}</svg>` // 新月
  if (litFraction > 0.97) return `${open}<circle cx="12" cy="12" r="${r}" class="moon-icon-lit"/></svg>` // 満月

  // 光っている側の半円＋明暗の境目（楕円の半分）で、光っている部分の形を作る
  const rx = (Math.abs(Math.cos(litFraction * Math.PI)) * r).toFixed(2)
  const outerSweep = waxing ? 1 : 0
  const innerSweep = litFraction > 0.5 ? (waxing ? 1 : 0) : waxing ? 0 : 1
  const path = `M 12 2 A ${r} ${r} 0 0 ${outerSweep} 12 22 A ${rx} ${r} 0 0 ${innerSweep} 12 2 Z`
  return `${open}${disc}<path d="${path}" class="moon-icon-lit"/></svg>`
}
