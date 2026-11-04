// 画面の起点。
import { renderLocationsScreen } from './screens/locationsScreen.js'
import { renderTopScreen } from './screens/topScreen.js'
import { loadLocations } from './storage/locationsStorage.js'
import './style.css'

const app = document.querySelector('#app')

const topContainer = document.createElement('div')

const toggleButton = document.createElement('button')
toggleButton.type = 'button'
toggleButton.textContent = '地点管理を開く'

const locationsContainer = document.createElement('div')
locationsContainer.hidden = true

// 地点管理は一番下に配置する
app.append(topContainer, toggleButton, locationsContainer)

function refreshTop() {
  renderTopScreen(topContainer, loadLocations())
}

toggleButton.addEventListener('click', () => {
  locationsContainer.hidden = !locationsContainer.hidden
  toggleButton.textContent = locationsContainer.hidden ? '地点管理を開く' : '地点管理を閉じる'
})

// 地点管理画面で地点が変わったら、トップ画面も再計算する
renderLocationsScreen(locationsContainer, { onChange: refreshTop })
refreshTop()
