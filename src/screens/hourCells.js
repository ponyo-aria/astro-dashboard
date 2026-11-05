// 1時間ごとのマス（ホームの表と詳細画面で共通の見た目）。

import { windLevel } from '../logic/levels.js'
import { cloudCellColor } from '../logic/detailStats.js'
import { skyStateOf } from '../logic/nightMatrix.js'
import { el, jstParts } from './format.js'

const SKY_STATE_LABELS = { dark: '暗い', moon: '月あり', twilight: '薄明' }

/** 時刻の見出しのマス */
export function hourLabelCell(slot) {
  return el('div', 'matrix-hour num', String(jstParts(slot).hour))
}

/** 空の状態（暗い／月あり／薄明）の帯のマス */
export function skyCell(slot, info) {
  const sky = skyStateOf(slot, info)
  const cell = el('div', `matrix-sky sky-${sky}`)
  cell.title = `${jstParts(slot).hour}時台：${SKY_STATE_LABELS[sky]}`
  return cell
}

/**
 * 雲のマス（黒＝晴れ／白＝曇り）。
 * percent：色に使う雲量（%）、isClear：晴れの印を付けるか、windMs：中に小さく出す風速（m/s、省略可）
 */
export function cloudCell({ percent, isClear = false, title = '', windMs = null }) {
  const cell = el('div', 'matrix-cell')
  if (percent == null) {
    cell.classList.add('is-empty')
    return cell
  }
  cell.style.backgroundColor = cloudCellColor(percent)
  if (isClear) cell.classList.add('is-clear')
  // 明るい（曇っている）マスの上では、文字を黒くして読めるようにする
  if (percent > 55) cell.classList.add('on-light')
  cell.title = title
  if (windMs != null) {
    // 風速の数字の色：注意（黄）・警戒（赤）。詳細画面の風のカードと同じしきい値
    const wind = el('span', `cell-wind num text-${windLevel(windMs)}`, String(Math.round(windMs)))
    cell.appendChild(wind)
    cell.title = `${title} 風速${windMs.toFixed(1)}m/s`.trim()
  }
  return cell
}
