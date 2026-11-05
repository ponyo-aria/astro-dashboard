// 設定画面：表示（赤色モード）・地点管理・リンク・このアプリについて をまとめる。
// 地点管理とリンクの中身は、それぞれの画面の部品（locationsScreen.js・launcherScreen.js）を使う。

import { createRedModeSwitch } from './redMode.js'
import { el } from './format.js'

/**
 * 設定画面の入れ物を作る。
 * @returns {{ locationsContainer: HTMLElement, launcherContainer: HTMLElement }}
 *   地点管理・リンクの中身を入れる場所（中身は main.js で描く）
 */
export function renderSettingsScreen(container) {
  container.innerHTML = ''
  // タイトルは、ほかの画面と同じ形（上に固定される欄・同じ文字の大きさ）にそろえる
  const header = el('header', 'top-header')
  header.appendChild(el('h1', 'top-title', '設定'))
  container.appendChild(header)

  // 表示
  const display = el('section', 'card settings-section')
  display.appendChild(el('h3', null, '表示'))
  const row = el('div', 'settings-row')
  const texts = el('div', 'settings-row-texts')
  texts.appendChild(el('span', 'settings-row-label', '赤色モード（ナイトモード）'))
  row.append(texts, createRedModeSwitch())
  display.appendChild(row)
  container.appendChild(display)

  const locationsContainer = el('div', 'settings-locations')
  const launcherContainer = el('div', 'settings-launcher')
  container.append(locationsContainer, launcherContainer)
  return { locationsContainer, launcherContainer }
}
