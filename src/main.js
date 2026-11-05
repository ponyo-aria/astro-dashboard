// 画面の起点。画面の下に4つのボタン（ホーム・詳細・比較・設定）を置き、押すと画面が切り替わる。
import { renderLocationsScreen } from './screens/locationsScreen.js'
import {
  renderTopScreen,
  getReferenceLocation,
  selectNight,
  getNightSelection,
} from './screens/topScreen.js'
import { renderDetailScreen } from './screens/detailScreen.js'
import { renderModelCompareScreen } from './screens/modelCompareScreen.js'
import { renderLauncherScreen } from './screens/launcherScreen.js'
import { renderSettingsScreen } from './screens/settingsScreen.js'
import { initRedMode } from './screens/redMode.js'
import { el } from './screens/format.js'
import { loadLocations } from './storage/locationsStorage.js'
import { loadForecastCache } from './storage/forecastCache.js'
import './style.css'

const app = document.querySelector('#app')

// 前回選んだ赤色モードを復元する（画面を描く前に行い、一瞬明るい画面が出ないようにする）
initRedMode()

// ---- 各画面の入れ物 ----
const topContainer = document.createElement('div') // ホーム
const detailContainer = document.createElement('div') // 詳細
const compareContainer = document.createElement('div') // 比較
const settingsContainer = document.createElement('div') // 設定（地点管理・リンクもここ）

const screens = {
  home: topContainer,
  detail: detailContainer,
  compare: compareContainer,
  settings: settingsContainer,
}
Object.values(screens).forEach((screen) => {
  screen.className = 'screen'
  app.appendChild(screen)
})
const { locationsContainer, launcherContainer } = renderSettingsScreen(settingsContainer)

// ---- 画面の下のボタン ----
// アイコンは外部から読み込まず、ここに直接描く（圏外でも表示できるように）
const NAV_ITEMS = [
  { id: 'home', label: 'ホーム', icon: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
  { id: 'detail', label: '詳細', icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>' },
  { id: 'compare', label: '比較', icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
  {
    id: 'settings',
    label: '設定',
    // 歯が8本の歯車（外から借りず、ここで描いた形）。放射状の線だけだと太陽に見えるため歯車の形にした
    icon: '<path d="M10.03 4.66 L10.58 1.90 L13.42 1.90 L13.97 4.66 L15.80 5.42 L18.14 3.85 L20.15 5.86 L18.58 8.20 L19.34 10.03 L22.10 10.58 L22.10 13.42 L19.34 13.97 L18.58 15.80 L20.15 18.14 L18.14 20.15 L15.80 18.58 L13.97 19.34 L13.42 22.10 L10.58 22.10 L10.03 19.34 L8.20 18.58 L5.86 20.15 L3.85 18.14 L5.42 15.80 L4.66 13.97 L1.90 13.42 L1.90 10.58 L4.66 10.03 L5.42 8.20 L3.85 5.86 L5.86 3.85 L8.20 5.42Z"/><circle cx="12" cy="12" r="3"/>',
  },
]

const nav = document.createElement('nav')
nav.className = 'bottom-nav'
nav.setAttribute('aria-label', '画面の切り替え')
const navButtons = {}
NAV_ITEMS.forEach(({ id, label, icon }) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bottom-nav-button'
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span>`
  button.addEventListener('click', () => navigateTo(id))
  navButtons[id] = button
  nav.appendChild(button)
})
// 出典表示（Open-Meteo の利用条件：データを表示する場所のそばに、出典とライセンスへのリンクを出す）。
// 各画面の一番下（中身のすぐ下）に1行で出す。画面の入れ物の後ろに1つだけ置くので、
// どの画面を開いていても、その画面の一番下に表示される
// （下のボタンの帯の中に置くと押し間違えやすい、というオーナーの指摘で移した）
const credit = document.createElement('p')
credit.className = 'page-credit'
credit.innerHTML =
  '気象データ：<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>' +
  '（<a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noopener">CC BY 4.0</a>）を加工して表示'
app.appendChild(credit)
document.body.appendChild(nav)

let currentScreen = null

// ---- スマホの「戻る」操作への対応 ----
// ブラウザの「戻る」の記録（履歴）を使う。記録の段数（depth）は次のとおり：
//   0：ホーム
//   1：詳細・比較・設定
//   2：比較画面から開いた詳細（戻る1回で比較画面に戻れるように）
// これで、
//   ・詳細や比較・設定で「戻る」→ 1つ前の画面（ホームか比較）に戻る
//   ・ホームで「戻る」→ アプリを閉じる（Androidの普通の動き）
//   ・下の「ホーム」ボタン → 何段目にいても一気にホームに戻る
function currentDepth() {
  return history.state?.depth ?? 0
}

/** 別の画面に進むときに「戻る」の記録を残す。stack：今の画面の上に重ねる（戻ると今の画面に戻る） */
function rememberView(view, { stack = false } = {}) {
  const depth = currentDepth()
  if (depth === 0 || stack) history.pushState({ view, depth: depth + 1 }, '')
  else history.replaceState({ view, depth }, '')
}

/** 画面の下のボタンが押されたとき */
function navigateTo(id) {
  if (id === 'home') {
    // 何段目にいても、一気にホームまで戻る
    const depth = currentDepth()
    if (depth > 0) history.go(-depth)
    return
  }
  // 比較画面から開いた詳細で「比較」を押したら、比較画面に戻る
  if (id === 'compare' && currentScreen === 'detail' && currentDepth() === 2) {
    history.back()
    return
  }
  if (id === currentScreen) return
  rememberView(id)
  if (id === 'detail') showDetail(...defaultDetail())
  else showScreen(id)
}

// 「戻る」操作（スワイプ・戻るボタン）をされたとき
window.addEventListener('popstate', (event) => {
  const view = event.state?.view ?? 'home'
  if (view === 'detail') showDetail(...defaultDetail())
  else showScreen(view)
})

/** 下のボタンのうち、光らせるボタンを決める */
function highlightNav(id) {
  Object.entries(navButtons).forEach(([key, button]) => {
    button.classList.toggle('is-active', key === id)
    if (key === id) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
}

function showScreen(id) {
  currentScreen = id
  Object.entries(screens).forEach(([key, screen]) => {
    screen.hidden = key !== id
  })
  highlightNav(id)

  // 比較・設定（リンク）は、開くたびに最新の状態で描き直す
  if (id === 'compare') {
    // 比較画面で予報を取り直したら、ホームにも反映する
    renderModelCompareScreen(compareContainer, loadLocations(), {
      onUpdated: refreshTop,
      // 比較画面の行を押したら、その地点・その夜の詳細を開く（戻ると比較画面に戻る）
      onOpenDetail: (location, nightDate, options) =>
        openDetail(location, nightDate, { ...options, from: 'compare' }),
    })
  }
  if (id === 'settings') {
    renderLauncherScreen(launcherContainer, {
      getLocation: () => {
        const locations = loadLocations()
        return locations.length > 0 ? getReferenceLocation(locations) : null
      },
    })
  }
  window.scrollTo(0, 0)
}

// ---- ホームと詳細 ----
function refreshTop() {
  renderTopScreen(topContainer, loadLocations(), { onCardClick: openDetail })
}

let lastDetail = null // 最後に開いた詳細（下のボタンの「詳細」や「進む」操作で開き直すため）

/**
 * 下のボタンの「詳細」で開く内容：最後に見ていた地点・夜。
 * まだ一度も開いていなければ、ホームで選んでいる夜の、登録地点の1つ目
 */
function defaultDetail() {
  const locations = loadLocations()
  const { nightDates, index } = getNightSelection()
  const location =
    (lastDetail && locations.find((loc) => loc.id === lastDetail.location.id)) ?? locations[0]
  const nightDate = lastDetail?.nightDate ?? nightDates[index]
  return [location, nightDate, { nightDates: lastDetail?.nightDates ?? nightDates, model: lastDetail?.model }]
}

// ホーム・比較画面の行が押されたとき。
// from：どの画面から開いたか（'home' か 'compare'）、model：最初に表示するモデル（省略時は自動）
function openDetail(location, nightDate, { nightDates, model = null, from = 'home' } = {}) {
  rememberView('detail', { stack: from === 'compare' })
  if (from === 'compare') {
    // ホームで選んでいる夜も、開いた夜にそろえておく（詳細から戻ってホームに行ったとき用）
    const index = nightDates?.findIndex((d) => d.getTime() === nightDate.getTime()) ?? -1
    if (index >= 0) selectNight(index)
  }
  showDetail(location, nightDate, { nightDates, model })
}

function showDetail(location, nightDate, { nightDates, model = null } = {}) {
  showScreen('detail')
  if (!location) {
    detailContainer.innerHTML = ''
    detailContainer.appendChild(
      el('p', 'empty-message', '地点が登録されていません。下の「設定」の地点管理から追加してください。')
    )
    return
  }
  lastDetail = { location, nightDate, nightDates, model }
  renderDetailScreen(detailContainer, {
    location,
    locations: loadLocations(),
    nightDate,
    nightDates,
    initialModel: model,
    cache: loadForecastCache(),
    // 詳細画面で前の夜・次の夜に移ったら、ホームで選んでいる夜もそろえる
    onNightChange: (index, date) => {
      lastDetail.nightDate = date
      lastDetail.model = null // 夜を移ったらモデルは自動で選び直す
      selectNight(index)
    },
    // 地点を切り替えたら覚えておく（下のボタンの「詳細」で開き直したときに同じ地点を出すため）
    onLocationChange: (next) => {
      lastDetail.location = next
    },
  })
  window.scrollTo(0, 0)
}

// 公開版（npm run build で作ったもの）のときだけ、アプリ本体を端末に保存する仕組みを登録する。
// 開発中（npm run dev）に登録すると古い画面が残って紛らわしいので登録しない。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // 新しい版を公開したとき：スマホは保存済みの古い版でいったん起動し、裏で新しい版を取り込む。
  // 取り込みが終わって新しい版に切り替わったら、画面を1回だけ自動で読み込み直して新しい版を出す。
  // （初めて開いたとき＝もともと古い版が無いときは読み込み直さない）
  const hadOldVersion = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadOldVersion || reloading) return
    reloading = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        // Androidでは、アプリを閉じたつもりでも裏で開いたままのことがある。
        // 裏から前に戻ってきたときにも、新しい版が無いか確かめる
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        })
      })
      .catch(() => {
        // 登録に失敗してもアプリ自体は普通に使えるので、何もしない
      })
  })
}

// 地点管理（設定画面の中）で地点が変わったら、ホームも計算し直す
renderLocationsScreen(locationsContainer, { onChange: refreshTop })
refreshTop()
// 最初の画面（ホーム）を「戻る」の記録の一番下にする
history.replaceState({ view: 'home' }, '')
showScreen('home')
