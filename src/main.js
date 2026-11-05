// 画面の起点。画面の下に4つのボタン（ホーム・比較・地点・リンク）を置き、押すと画面が切り替わる。
import { renderLocationsScreen } from './screens/locationsScreen.js'
import { renderTopScreen, getReferenceLocation, selectNight } from './screens/topScreen.js'
import { renderDetailScreen } from './screens/detailScreen.js'
import { renderModelCompareScreen } from './screens/modelCompareScreen.js'
import { renderLauncherScreen } from './screens/launcherScreen.js'
import { initRedMode } from './screens/redMode.js'
import { loadLocations } from './storage/locationsStorage.js'
import { loadForecastCache } from './storage/forecastCache.js'
import './style.css'

const app = document.querySelector('#app')

// 前回選んだ赤色モードを復元する（画面を描く前に行い、一瞬明るい画面が出ないようにする）
initRedMode()

// ---- 各画面の入れ物 ----
const homeContainer = document.createElement('div') // トップ画面と地点詳細画面
const topContainer = document.createElement('div')
const detailContainer = document.createElement('div')
detailContainer.hidden = true
homeContainer.append(topContainer, detailContainer)

const compareContainer = document.createElement('div')
const locationsContainer = document.createElement('div')
const launcherContainer = document.createElement('div')

const screens = {
  home: homeContainer,
  compare: compareContainer,
  locations: locationsContainer,
  launcher: launcherContainer,
}
Object.values(screens).forEach((screen) => {
  screen.className = 'screen'
  app.appendChild(screen)
})

// ---- 画面の下のボタン ----
// アイコンは外部から読み込まず、ここに直接描く（圏外でも表示できるように）
const NAV_ITEMS = [
  { id: 'home', label: 'ホーム', icon: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
  { id: 'compare', label: '比較', icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
  { id: 'locations', label: '地点', icon: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>' },
  { id: 'launcher', label: 'リンク', icon: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>' },
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
document.body.appendChild(nav)

let currentScreen = null

// ---- スマホの「戻る」操作への対応 ----
// ブラウザの「戻る」の記録（履歴）を使う。記録の段数（depth）は次のとおり：
//   0：ホーム
//   1：比較・地点・リンク、またはホームから開いた詳細
//   2：比較画面から開いた詳細（戻る1回で比較画面に戻れるように）
// これで、
//   ・詳細や比較・地点・リンクで「戻る」→ 1つ前の画面（ホームか比較）に戻る
//   ・ホームで「戻る」→ アプリを閉じる（Androidの普通の動き）
//   ・下の「ホーム」ボタン → 何段目にいても一気にホームに戻る
function currentView() {
  if (currentScreen === 'home' && !detailContainer.hidden) return 'detail'
  return currentScreen
}

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
  if (id === 'compare' && currentView() === 'detail' && lastDetail?.from === 'compare') {
    history.back()
    return
  }
  if (id === currentView()) return
  rememberView(id)
  closeDetail()
  showScreen(id)
}

// 「戻る」操作（スワイプ・戻るボタン）をされたとき
window.addEventListener('popstate', (event) => {
  const view = event.state?.view ?? 'home'
  if (view === 'detail' && lastDetail) {
    showScreen('home')
    showDetail(lastDetail.location, lastDetail.nightDate, lastDetail)
    return
  }
  closeDetail()
  showScreen(view === 'detail' ? 'home' : view)
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

  // 比較・リンクは、開くたびに最新の状態で描き直す
  if (id === 'compare') {
    // 比較画面で予報を取り直したら、ホームにも反映する
    renderModelCompareScreen(compareContainer, loadLocations(), {
      onUpdated: refreshTop,
      // 比較画面の行を押したら、その地点・その夜の詳細を開く（戻ると比較画面に戻る）
      onOpenDetail: (location, nightDate, options) =>
        openDetail(location, nightDate, { ...options, from: 'compare' }),
    })
  }
  if (id === 'launcher') {
    renderLauncherScreen(launcherContainer, {
      getLocation: () => {
        const locations = loadLocations()
        return locations.length > 0 ? getReferenceLocation(locations) : null
      },
    })
  }
  window.scrollTo(0, 0)
}

// ---- トップ画面と地点詳細画面 ----
function refreshTop() {
  renderTopScreen(topContainer, loadLocations(), { onCardClick: openDetail })
}

let lastDetail = null // 最後に開いた詳細（「進む」操作で開き直すため）

// トップ画面・比較画面の行が押されたとき。
// from：どの画面から開いたか（'home' か 'compare'）、model：最初に表示するモデル（省略時は自動）
function openDetail(location, nightDate, { nightDates, model = null, from = 'home' } = {}) {
  rememberView('detail', { stack: from === 'compare' })
  if (from === 'compare') {
    showScreen('home') // 詳細画面はホームの入れ物の中にあるため
    // ホームで選んでいる夜も、開いた夜にそろえておく（詳細から戻ってホームに行ったとき用）
    const index = nightDates?.findIndex((d) => d.getTime() === nightDate.getTime()) ?? -1
    if (index >= 0) selectNight(index)
  }
  showDetail(location, nightDate, { nightDates, model, from })
}

function showDetail(location, nightDate, { nightDates, model = null, from = 'home' } = {}) {
  lastDetail = { location, nightDate, nightDates, model, from }
  topContainer.hidden = true
  detailContainer.hidden = false
  // 比較画面から開いたときは、下のボタンは「比較」を光らせたままにする
  highlightNav(from === 'compare' ? 'compare' : 'home')
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
    // 地点を切り替えたら覚えておく（「進む」操作で開き直したときに同じ地点を出すため）
    onLocationChange: (next) => {
      lastDetail.location = next
    },
    // 画面上の「‹ 戻る」も、スマホの「戻る」操作と同じ動きにする
    onBack: () => history.back(),
  })
  window.scrollTo(0, 0)
}

function closeDetail() {
  detailContainer.hidden = true
  topContainer.hidden = false
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

// 地点管理画面で地点が変わったら、トップ画面も再計算する
renderLocationsScreen(locationsContainer, { onChange: refreshTop })
refreshTop()
// 最初の画面（ホーム）を「戻る」の記録の一番下にする
history.replaceState({ view: 'home' }, '')
showScreen('home')
