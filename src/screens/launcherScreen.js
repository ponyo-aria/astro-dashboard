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
  heading.textContent = 'リンク'
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
  container.appendChild(renderAbout())
}

// このアプリについて（データの出どころ・ライセンス）
function renderAbout() {
  const about = document.createElement('section')
  about.className = 'launcher-section about-section'
  about.innerHTML = `
    <h3>このアプリについて</h3>
    <p>
      気象データ：<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>
      （<a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noopener">CC BY 4.0</a>）。
      Open-Meteo が提供する、気象庁（MSM・GSM）・ECMWF（IFS・AIFS）などの公開データを使っています。
    </p>
    <p>
      このアプリでは、雲量などのデータをもとに「撮影可能時間」や「◎△×」の判定を計算し、加工して表示しています。
      判定はアプリ独自の目安で、各機関の予報そのものではありません。
    </p>
    <p>天文計算：<a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">Astronomy Engine</a>（MIT License）</p>
  `
  return about
}
