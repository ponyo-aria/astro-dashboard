// ランチャー画面：Windy・SCW・AstroBin を開くボタンを並べる。

import { LAUNCHER_ITEMS } from '../logic/launcherLinks.js'

/**
 * getLocation：Windy に渡す地点（トップ画面の「基準地点」）を返す関数。
 * 基準地点はあとから切り替えられるので、押した瞬間の地点を使うために関数で受け取る。
 */
export function renderLauncherScreen(container, { getLocation }) {
  container.innerHTML = ''

  const section = document.createElement('div')
  section.className = 'launcher-section'

  const heading = document.createElement('h3')
  heading.textContent = 'ランチャー'
  section.appendChild(heading)

  const location = getLocation()
  if (location) {
    const note = document.createElement('p')
    note.className = 'launcher-note'
    note.textContent = `Windy は基準地点（${location.name}）の場所で開きます。`
    section.appendChild(note)
  }

  const list = document.createElement('div')
  list.className = 'launcher-buttons'

  LAUNCHER_ITEMS.forEach((item) => {
    // 座標が必要なのに地点が無いときは、ボタンを出さない
    if (item.needsLocation && !location) return

    const link = document.createElement('a')
    link.className = 'launcher-button'
    link.dataset.launcherId = item.id
    link.textContent = item.label
    link.href = item.buildUrl(location)
    // 別のタブ（ブラウザ）で開き、このアプリは残しておく
    link.target = '_blank'
    link.rel = 'noopener'
    // 押した瞬間の基準地点でリンク先を作り直す（途中で基準地点を変えた場合に備える）
    link.addEventListener('click', () => {
      link.href = item.buildUrl(getLocation() ?? location)
    })
    list.appendChild(link)
  })

  section.appendChild(list)
  container.appendChild(section)
}
