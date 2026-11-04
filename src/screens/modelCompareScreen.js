// モデル比較画面：地点ごとに、夜×モデル（MSM/ECMWF）の判定を表で並べる。

import { fetchModelUpdateInfo } from '../api/forecast.js'
import { loadForecastCache } from '../storage/forecastCache.js'
import { NIGHT_COUNT, computeNightJudgment } from '../logic/nightJudgment.js'

const TIME_ZONE = 'Asia/Tokyo'
const MODEL_LABELS = { msm: 'MSM', ecmwf: 'ECMWF' }

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

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

function formatDateTime(date) {
  return new Date(date).toLocaleString('ja-JP', { timeZone: TIME_ZONE })
}

// モデル単独の判定（撮影可/不可）を表示用の短い文字列にする
function modelResultLabel(modelResult) {
  if (!modelResult?.available) {
    return { text: '範囲外', className: 'judgment-neutral' }
  }
  return modelResult.isGo
    ? { text: `可（${modelResult.clearHours.toFixed(1)}h）`, className: 'judgment-go' }
    : { text: `不可（${modelResult.clearHours.toFixed(1)}h）`, className: 'judgment-no-go' }
}

export async function renderModelCompareScreen(container, locations) {
  container.innerHTML = ''

  const heading = document.createElement('h2')
  heading.textContent = 'モデル比較'
  container.appendChild(heading)

  if (locations.length === 0) {
    const p = document.createElement('p')
    p.textContent = '地点が登録されていません。「地点管理」から追加してください。'
    container.appendChild(p)
    return
  }

  const cache = loadForecastCache()

  if (!cache) {
    const p = document.createElement('p')
    p.textContent = 'まだ予報データがありません。トップ画面で一度「更新」してから開いてください。'
    container.appendChild(p)
    return
  }

  // モデルの最終更新時刻・次回更新の目安を表示する
  try {
    const [msmMeta, ecmwfMeta] = await Promise.all([
      fetchModelUpdateInfo('msm'),
      fetchModelUpdateInfo('ecmwf'),
    ])
    ;[
      ['msm', msmMeta],
      ['ecmwf', ecmwfMeta],
    ].forEach(([key, meta]) => {
      const p = document.createElement('p')
      const nextUpdate = new Date(
        new Date(meta.initTime).getTime() + meta.updateIntervalSeconds * 1000
      )
      p.textContent = `${MODEL_LABELS[key]} 最終更新：${formatDateTime(meta.initTime)}（次は${formatDateTime(nextUpdate)}ごろ）`
      container.appendChild(p)
    })
  } catch {
    const p = document.createElement('p')
    p.className = 'error-message'
    p.textContent = '最終更新時刻は取得できませんでした（通信エラー）'
    container.appendChild(p)
  }

  const today = new Date()

  locations.forEach((location) => {
    const section = document.createElement('div')
    section.className = 'compare-section'

    const locationHeading = document.createElement('h3')
    locationHeading.textContent = location.name
    section.appendChild(locationHeading)

    const table = document.createElement('table')
    table.className = 'compare-table'

    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>日付</th><th>MSM</th><th>ECMWF</th></tr>'
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    for (let i = 0; i < NIGHT_COUNT; i += 1) {
      const nightDate = noonOf(addDays(today, i))
      const { judgment } = computeNightJudgment(location, nightDate, cache)

      const msmLabel = modelResultLabel(judgment.msm)
      const ecmwfLabel = modelResultLabel(judgment.ecmwf)

      const row = document.createElement('tr')
      row.innerHTML = `
        <td>${formatDate(nightDate)}</td>
        <td class="${msmLabel.className}">${msmLabel.text}</td>
        <td class="${ecmwfLabel.className}">${ecmwfLabel.text}</td>
      `
      tbody.appendChild(row)
    }
    table.appendChild(tbody)

    section.appendChild(table)
    container.appendChild(section)
  })
}
