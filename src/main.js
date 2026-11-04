// 画面の起点。
import { renderLocationsScreen } from './screens/locationsScreen.js'
import { renderTopScreen } from './screens/topScreen.js'
import { renderDetailScreen } from './screens/detailScreen.js'
import { loadLocations } from './storage/locationsStorage.js'
import { loadForecastCache } from './storage/forecastCache.js'
import './style.css'

const app = document.querySelector('#app')

const topContainer = document.createElement('div')
const detailContainer = document.createElement('div')
detailContainer.hidden = true

const toggleButton = document.createElement('button')
toggleButton.type = 'button'
toggleButton.textContent = '地点管理を開く'

const locationsContainer = document.createElement('div')
locationsContainer.hidden = true

// 地点管理は一番下に配置する
app.append(topContainer, detailContainer, toggleButton, locationsContainer)

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

toggleButton.addEventListener('click', () => {
  locationsContainer.hidden = !locationsContainer.hidden
  toggleButton.textContent = locationsContainer.hidden ? '地点管理を開く' : '地点管理を閉じる'
})

// 地点管理画面で地点が変わったら、トップ画面も再計算する
renderLocationsScreen(locationsContainer, { onChange: refreshTop })
refreshTop()
