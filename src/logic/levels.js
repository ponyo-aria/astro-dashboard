// 注意の段階（問題なし→注意→警戒）を決める。風・結露・低層雲で同じ見せ方にそろえるために使う。
//   'ok'＝問題なし（白）、'caution'＝注意（黄）、'danger'＝警戒（赤）
// しきい値はすべて src/config.js にある。

import { config } from '../config.js'

const ORDER = ['ok', 'caution', 'danger']

/** いくつかの段階のうち、いちばん厳しいもの */
export function worstLevel(...levels) {
  return levels.reduce(
    (worst, level) => (ORDER.indexOf(level ?? 'ok') > ORDER.indexOf(worst) ? level : worst),
    'ok'
  )
}

/** 平均の風速（m/s）：5以上で注意、8以上で警戒 */
export function windLevel(ms) {
  if (ms == null) return 'ok'
  if (ms >= config.windDangerThreshold) return 'danger'
  if (ms >= config.windCautionThreshold) return 'caution'
  return 'ok'
}

/** 最大瞬間風速（m/s）：10以上で注意、15以上で警戒 */
export function gustLevel(ms) {
  if (ms == null) return 'ok'
  if (ms >= config.gustDangerThreshold) return 'danger'
  if (ms >= config.gustCautionThreshold) return 'caution'
  return 'ok'
}

/** 結露：気温と露点の差（℃）が4以下で注意、2以下で警戒 */
export function dewLevel(spread) {
  if (spread == null) return 'ok'
  if (spread <= config.dewPointRiskHighMax) return 'danger'
  if (spread <= config.dewPointRiskCautionMax) return 'caution'
  return 'ok'
}

/**
 * 直前の雨：暗くなる時にまだ降っている、または夜間にも降る予報なら警戒。
 * 暗くなる前の12時間以内に1mm以上、または24時間で10mm以上降っていたら注意
 * （地面が濡れていて、霧や靄が出やすい）
 */
export function rainLevel(rain) {
  if (!rain) return 'ok'
  if (rain.rainingAtDark || rain.nightMm >= config.rainNightMinMm) return 'danger'
  if (rain.recentMm >= config.rainWetMinMm || rain.totalMm >= config.rainHeavyMm) return 'caution'
  return 'ok'
}

/** 周辺5kmの低層雲（%）：5を超えたら注意、30を超えたら警戒 */
export function lowCloudLevel(percent) {
  if (percent == null) return 'ok'
  if (percent > config.lowCloudRiskThreshold) return 'danger'
  if (percent > config.surroundingLowCloudCautionThreshold) return 'caution'
  return 'ok'
}
