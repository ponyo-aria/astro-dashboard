// 画面の起点。
import { renderLocationsScreen } from './screens/locationsScreen.js'
import { renderNightsScreen } from './screens/nightsScreen.js'
import { renderForecastScreen } from './screens/forecastScreen.js'
import { loadLocations } from './storage/locationsStorage.js'
import './style.css'

const app = document.querySelector('#app')

const locationsContainer = document.createElement('div')
const nightsContainer = document.createElement('div')
const forecastContainer = document.createElement('div')
app.append(locationsContainer, nightsContainer, forecastContainer)

function refreshNights() {
  renderNightsScreen(nightsContainer, loadLocations())
}

async function refreshForecast() {
  await renderForecastScreen(forecastContainer, loadLocations())
  // 予報データが揃ったら、判定（◎△×）を反映するために7夜一覧を描き直す
  refreshNights()
}

// 地点管理画面で地点が変わったら、暗い時間・予報の一覧も再計算する
renderLocationsScreen(locationsContainer, {
  onChange: () => {
    refreshNights()
    refreshForecast()
  },
})
refreshNights()
refreshForecast()
