// 選んだ1地点の「今後7夜の暗い時間」を表示する画面（Step 2：判定はまだ行わない）。
//
// 複数地点の表示はStep 5（トップ画面）で作る。それまでは地点ごとの差が
// 近場だとほぼ無いため、動作確認用に1地点だけ選んで表示する。
// 将来的にはスマホのGPSから自動選択に置き換える想定（オーナーと合意済み）。

import { createObserver, computeNightInfo } from '../logic/astronomy.js'

const NIGHT_COUNT = 7
const TIME_ZONE = 'Asia/Tokyo'
const SELECTED_LOCATION_KEY = 'astro-dashboard.selectedLocationId.v1'
const DEFAULT_LOCATION_NAME = '八ヶ岳ふれあい公園' // 野辺山

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

// 「D日の夜」の探索の起点として、D日の正午（JST）を作る
function noonOf(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return new Date(`${parts}T12:00:00+09:00`)
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

function formatTime(date) {
  if (!date) return '―'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatHours(hours) {
  return `${hours.toFixed(1)}h`
}

function pickDefaultLocation(locations) {
  const byDefaultName = locations.find((loc) => loc.name === DEFAULT_LOCATION_NAME)
  return byDefaultName ?? locations[0]
}

function getSelectedLocation(locations) {
  const savedId = localStorage.getItem(SELECTED_LOCATION_KEY)
  const saved = locations.find((loc) => loc.id === savedId)
  return saved ?? pickDefaultLocation(locations)
}

function renderNightsTable(location) {
  const section = document.createElement('div')
  section.className = 'nights-section'

  const table = document.createElement('div')
  table.className = 'nights-table'

  const observer = createObserver(location.lat, location.lng, location.elevation ?? 0)
  const today = new Date()

  for (let i = 0; i < NIGHT_COUNT; i += 1) {
    const nightDate = noonOf(addDays(today, i))
    const info = computeNightInfo(observer, nightDate)

    const row = document.createElement('div')
    row.className = 'nights-row'
    row.innerHTML = `
      <div class="nights-row-date">${formatDate(nightDate)}</div>
      <div class="nights-row-detail">
        日没 ${formatTime(info.sunset)} → 日の出 ${formatTime(info.sunrise)}<br>
        薄明終了 ${formatTime(info.duskEnd)} 〜 薄明開始 ${formatTime(info.dawnStart)}<br>
        月齢 ${info.moonAgeDays.toFixed(1)}<br>
        <strong>暗い時間：${formatHours(info.darkHours)}</strong>
      </div>
    `
    table.appendChild(row)
  }

  section.appendChild(table)
  return section
}

export function renderNightsScreen(container, locations) {
  container.innerHTML = ''

  const heading = document.createElement('h2')
  heading.textContent = '今後7夜の暗い時間'
  container.appendChild(heading)

  if (locations.length === 0) {
    const empty = document.createElement('p')
    empty.textContent = '地点が登録されていません。「地点管理」から追加してください。'
    container.appendChild(empty)
    return
  }

  const selected = getSelectedLocation(locations)

  const select = document.createElement('select')
  locations.forEach((loc) => {
    const option = document.createElement('option')
    option.value = loc.id
    option.textContent = loc.name
    if (loc.id === selected.id) {
      option.selected = true
    }
    select.appendChild(option)
  })
  select.addEventListener('change', (e) => {
    localStorage.setItem(SELECTED_LOCATION_KEY, e.target.value)
    renderNightsScreen(container, locations)
  })
  container.appendChild(select)

  container.appendChild(renderNightsTable(selected))
}
