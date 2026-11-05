// 画面で共通して使う、日時の書き方や小さな部品。

import { STATUS_SHORT, STATUS_CAPTION } from '../logic/nightMatrix.js'

export const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']
// 曜日の色分け：金曜（翌日が休み）＝黄、土曜＝青、日曜＝赤
export const WEEKDAY_CLASSES = { 0: 'wd-sun', 5: 'wd-fri', 6: 'wd-sat' }

/** 日本時間での月・日・曜日・時・分 */
export function jstParts(date) {
  const d = new Date(new Date(date).getTime() + 9 * 60 * 60 * 1000)
  return {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

/** 例：18:05 */
export function formatTime(date) {
  if (!date) return '―'
  const p = jstParts(date)
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`
}

/** 例：11/5 18:05 */
export function formatDateTime(date) {
  const p = jstParts(date)
  return `${p.month}/${p.day} ${formatTime(date)}`
}

/** 例：11/8(土)の夜 */
export function formatNightTitle(nightDate) {
  const p = jstParts(nightDate)
  return `${p.month}/${p.day}(${WEEKDAY_NAMES[p.weekday]})の夜`
}

/** 撮影可能時間の表示（1時間ごとの予報で数えるので、ふつうは整数になる） */
export function formatHours(hours) {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

/** 要素を1つ作る小さな道具 */
export function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** その夜の暗い時間・月の出入り・月齢を1行にまとめた文字 */
export function nightAstroText(info) {
  const darkText =
    info.darkIntervals.length > 0
      ? info.darkIntervals.map((i) => `${formatTime(i.start)}〜${formatTime(i.end)}`).join('、')
      : '暗い時間なし（月明かり）'
  const moonText = info.moonEvents
    .map((e) => `${e.type === 'rise' ? '月の出' : '月の入り'} ${formatTime(e.time)}`)
    .join('・')
  return [darkText, moonText, `月齢 ${info.moonAgeDays.toFixed(1)}`].filter(Boolean).join(' ／ ')
}

// ---- 判定の書き方（ホームの表・詳細画面で共通） ----

/** 撮影可能時間。△（割れ）のときは、どちらのモデルが何時間と言っているか分かるよう両方出す（MSM/ECMWF） */
export function clearHoursOf(judgment) {
  if (judgment.status === 'split') {
    return `${judgment.msm.clearHours}h/${judgment.ecmwf.clearHours}h`
  }
  const hours = judgment.msm?.clearHours ?? judgment.ecmwf?.clearHours
  return typeof hours === 'number' ? formatHours(hours) : ''
}

/** 判定の短い文字。例：「◎ 5h」「△ 0h/5h」「参考 ○ 3h」「月明かり」「データなし」 */
export function judgmentText(judgment) {
  const { status } = judgment
  if (status === 'no_dark_time' || status === 'no_data') return STATUS_CAPTION[status]
  const prefix = status.startsWith('reference') ? `${STATUS_CAPTION[status]} ` : ''
  return `${prefix}${STATUS_SHORT[status]} ${clearHoursOf(judgment)}`.trim()
}
