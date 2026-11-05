// 画面の起点。
import { renderLocationsScreen } from './screens/locationsScreen.js'
import { renderTopScreen } from './screens/topScreen.js'
import { renderDetailScreen } from './screens/detailScreen.js'
import { renderModelCompareScreen } from './screens/modelCompareScreen.js'
import { loadLocations } from './storage/locationsStorage.js'
import { loadForecastCache } from './storage/forecastCache.js'
import './style.css'

const app = document.querySelector('#app')

const topContainer = document.createElement('div')
const detailContainer = document.createElement('div')
detailContainer.hidden = true
const compareContainer = document.createElement('div')
compareContainer.hidden = true

const compareToggleButton = document.createElement('button')
compareToggleButton.type = 'button'
compareToggleButton.textContent = 'モデル比較を開く'

const toggleButton = document.createElement('button')
toggleButton.type = 'button'
toggleButton.textContent = '地点管理を開く'

const locationsContainer = document.createElement('div')
locationsContainer.hidden = true

// 地点管理は一番下に配置する
app.append(
  topContainer,
  detailContainer,
  compareContainer,
  compareToggleButton,
  toggleButton,
  locationsContainer
)

function refreshTop() {
  renderTopScreen(topContainer, loadLocations(), { onCardClick: openDetail })
}

function openDetail(location, nightDate) {
  topContainer.hidden = true
  detailContainer.hidden = false
  renderDetailScreen(detailContainer, {
    location,
    nightDate,
    cache: loadForecastCache(),
    onBack: closeDetail,
  })
}

function closeDetail() {
  detailContainer.hidden = true
  topContainer.hidden = false
}

compareToggleButton.addEventListener('click', () => {
  compareContainer.hidden = !compareContainer.hidden
  compareToggleButton.textContent = compareContainer.hidden
    ? 'モデル比較を開く'
    : 'モデル比較を閉じる'
  if (!compareContainer.hidden) {
    renderModelCompareScreen(compareContainer, loadLocations())
  }
})

toggleButton.addEventListener('click', () => {
  locationsContainer.hidden = !locationsContainer.hidden
  toggleButton.textContent = locationsContainer.hidden ? '地点管理を開く' : '地点管理を閉じる'
})

// 公開版（npm run build で作ったもの）のときだけ、アプリ本体を端末に保存する仕組みを登録する。
// 開発中（npm run dev）に登録すると古い画面が残って紛らわしいので登録しない。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 登録に失敗してもアプリ自体は普通に使えるので、何もしない
    })
  })
}

// 地点管理画面で地点が変わったら、トップ画面も再計算する
renderLocationsScreen(locationsContainer, { onChange: refreshTop })
refreshTop()
