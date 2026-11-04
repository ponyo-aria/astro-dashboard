// 地点詳細画面：夜間の時間別グラフと数値情報を表示する。

import { Chart } from 'chart.js/auto'
import annotationPlugin from 'chartjs-plugin-annotation'
import { createObserver, computeNightInfo, getMoonAltitude } from '../logic/astronomy.js'
import { judgeModelForNight } from '../logic/judgment.js'
import {
  sumPrecipitation,
  minNightTemperature,
  dewPointRisk,
  nightWindInfo,
  representativeWindDirection850,
  directionLabel,
  surroundingLowCloudSummary,
  cloudCellColor,
} from '../logic/detailStats.js'

Chart.register(annotationPlugin)

const TIME_ZONE = 'Asia/Tokyo'
const MODEL_LABELS = { msm: 'MSM', ecmwf: 'ECMWF' }

const DEW_POINT_LABELS = { high: '高', caution: '注意', low: '低' }

function parseLocalTime(timeString) {
  return new Date(`${timeString}:00+09:00`)
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

function formatHourLabel(timeString) {
  const date = parseLocalTime(timeString)
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatTime(date) {
  if (!date) return '―'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date))
}

function closestIndex(times, target) {
  if (!target) return null
  let best = 0
  let bestDiff = Infinity
  times.forEach((t, i) => {
    const diff = Math.abs(parseLocalTime(t).getTime() - target.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  })
  return best
}

function findForecast(cache, modelKey, locationId) {
  return cache?.results?.[modelKey]?.find((r) => r.locationId === locationId)
}

export function renderDetailScreen(container, { location, nightDate, cache, onBack }) {
  let chartInstance = null

  function pickInitialModel() {
    const msmForecast = findForecast(cache, 'msm', location.id)
    if (msmForecast) return 'msm'
    return 'ecmwf'
  }

  const state = { selectedModel: pickInitialModel() }

  // 夜の前後1時間を含めた範囲の時刻だけを取り出す（グラフ・ヒートマップ共通）
  function getNightIndices(hourly, info) {
    const padMs = 60 * 60 * 1000
    const rangeStart = new Date(info.sunset.getTime() - padMs)
    const rangeEnd = new Date(info.sunrise.getTime() + padMs)

    return hourly.time
      .map((t, i) => ({ t, i, time: parseLocalTime(t) }))
      .filter(({ time }) => time >= rangeStart && time <= rangeEnd)
  }

  // 雲量ヒートマップ（高層・中層・低層）と月高度グラフを、同じ時間軸（同じグリッドの列幅）で
  // 1つの横スクロール領域の中にまとめる。スクロールすると両方が一緒に動く。
  // 黒いほど晴れ、白いほど曇っている（夜空の感覚に合わせた配色）。
  function renderNightChart(hourly, indices, info, observer) {
    const wrapper = document.createElement('div')
    wrapper.className = 'cloud-heatmap'

    const legend = document.createElement('p')
    legend.className = 'cloud-heatmap-legend'
    legend.textContent =
      '黒＝晴れ／白に近いほど曇り。水色の枠は「暗い時間」。下の線は月の高度（黄色＝月が出ている時間）'
    wrapper.appendChild(legend)

    const scroll = document.createElement('div')
    scroll.className = 'cloud-heatmap-scroll'

    // 列幅を画面幅に合わせて均等割り（1fr）にし、スクロールしなくても全時間帯が見えるようにする
    const columns = `40px repeat(${indices.length}, 1fr)`
    const grid = document.createElement('div')
    grid.className = 'cloud-heatmap-grid'
    grid.style.gridTemplateColumns = columns
    // 行の高さをここで明示する（時刻ラベル・雲3段は低め、月高度グラフは見やすいよう高めに）
    grid.style.gridTemplateRows = '20px 24px 24px 24px 110px'

    // 1行目：時刻ラベル
    grid.appendChild(document.createElement('div'))
    indices.forEach(({ t, time }) => {
      const cell = document.createElement('div')
      cell.className = 'cloud-heatmap-time'
      const isDark = time >= info.duskEnd && time <= info.dawnStart
      if (isDark) cell.classList.add('cloud-heatmap-dark-col')
      cell.textContent = formatHourLabel(t).slice(0, 2)
      grid.appendChild(cell)
    })

    // 実際の空と同じように、上から高層・中層・低層の順に並べる
    const layers = [
      { key: 'cloud_cover_high', label: '高層' },
      { key: 'cloud_cover_mid', label: '中層' },
      { key: 'cloud_cover_low', label: '低層' },
    ]

    layers.forEach(({ key, label }) => {
      const labelCell = document.createElement('div')
      labelCell.className = 'cloud-heatmap-row-label'
      labelCell.textContent = label
      grid.appendChild(labelCell)

      indices.forEach(({ i, t, time }) => {
        const value = hourly[key][i]
        const cell = document.createElement('div')
        cell.className = 'cloud-heatmap-cell'
        cell.style.backgroundColor = cloudCellColor(value)
        const isDark = time >= info.duskEnd && time <= info.dawnStart
        if (isDark) cell.classList.add('cloud-heatmap-dark-col')
        cell.title = `${formatHourLabel(t)} ${label}雲量 ${value}%`
        grid.appendChild(cell)
      })
    })

    // 月高度の行：ラベル列＋時間の列ぶんをすべてまたぐ1マスの中にグラフを描く。
    // 列幅がヒートマップと完全に同じグリッドなので、時間軸がぴったり揃う。
    const moonLabelCell = document.createElement('div')
    moonLabelCell.className = 'cloud-heatmap-row-label'
    moonLabelCell.textContent = '月高度'
    grid.appendChild(moonLabelCell)

    const moonChartCell = document.createElement('div')
    moonChartCell.className = 'cloud-heatmap-moon-cell'
    moonChartCell.style.gridColumn = `2 / span ${indices.length}`
    const canvas = document.createElement('canvas')
    moonChartCell.appendChild(canvas)
    grid.appendChild(moonChartCell)

    scroll.appendChild(grid)
    wrapper.appendChild(scroll)
    container.appendChild(wrapper)

    renderMoonChart(canvas, indices, info, observer)
  }

  // 月高度だけの折れ線グラフ。軸は表示せず、上のヒートマップの列幅と揃えて埋め込む。
  function renderMoonChart(canvas, indices, info, observer) {
    const times = indices.map(({ t }) => t)
    const moonAltitude = times.map((t) => getMoonAltitude(observer, parseLocalTime(t)))
    const duskIndex = closestIndex(times, info.duskEnd)
    const dawnIndex = closestIndex(times, info.dawnStart)

    if (chartInstance) {
      chartInstance.destroy()
    }

    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: times.map((t) => formatHourLabel(t)),
        datasets: [
          {
            data: moonAltitude,
            borderColor: '#718096',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: 0,
            // 地平線（0°）より上は黄色、下はグレーの線にする
            segment: {
              borderColor: (ctx) => {
                const { p0, p1 } = ctx
                return p0.parsed.y >= 0 && p1.parsed.y >= 0 ? '#d4a300' : '#718096'
              },
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 0 },
        scales: {
          // offset:true でヒートマップの各マス（列）の中央に点を合わせる
          x: { offset: true, display: false },
          y: { min: -90, max: 90, display: false },
        },
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              darkBand:
                duskIndex !== null && dawnIndex !== null
                  ? {
                      type: 'box',
                      xMin: duskIndex,
                      xMax: dawnIndex,
                      yScaleID: 'y',
                      backgroundColor: 'rgba(56, 182, 255, 0.08)',
                      borderWidth: 0,
                    }
                  : undefined,
              horizon: {
                type: 'line',
                yMin: 0,
                yMax: 0,
                yScaleID: 'y',
                borderColor: '#4a5568',
                borderWidth: 1,
              },
            },
          },
        },
      },
    })
  }

  function renderChart(hourly, info, observer) {
    const indices = getNightIndices(hourly, info)

    if (indices.length === 0) {
      const p = document.createElement('p')
      p.textContent = 'グラフを表示できる時間帯のデータがありません'
      container.appendChild(p)
      return
    }

    renderNightChart(hourly, indices, info, observer)
  }

  function renderNumericInfo(hourly, windHourly, info, forecast) {
    const section = document.createElement('div')
    section.className = 'detail-numeric-section'

    const precip = sumPrecipitation(hourly, nightDate)
    const minTemp = minNightTemperature(hourly, info.sunset, info.sunrise)
    const dew = dewPointRisk(hourly, info.sunset, info.sunrise)
    const wind = windHourly ? nightWindInfo(windHourly, info.sunset, info.sunrise) : null
    const windDirDeg = windHourly
      ? representativeWindDirection850(windHourly, info.sunset, info.sunrise)
      : null

    const lines = [
      `前日〜当日の降水量合計：${precip.toFixed(1)}mm`,
      `夜間の最低気温：${minTemp === null ? '―' : `${minTemp.toFixed(1)}℃`}`,
      `結露リスク：${dew ? `${DEW_POINT_LABELS[dew.level]}（気温と露点の差 ${dew.minDiff.toFixed(1)}℃）` : '―'}`,
      `風速（ECMWF参考値）：${wind && wind.maxWindSpeedMs !== null ? `${wind.maxWindSpeedMs.toFixed(1)}m/s` : '―'}${wind?.caution ? '　⚠注意' : ''}`,
      `最大瞬間風速（ECMWF参考値）：${wind && wind.maxWindGustMs !== null ? `${wind.maxWindGustMs.toFixed(1)}m/s` : '―'}`,
      `雲が流れてくる方向（850hPa風向き・参考情報。判定には使用していません）：${windDirDeg == null ? '―' : `${directionLabel(windDirDeg)}（${Math.round(windDirDeg)}°）から`}`,
    ]

    lines.forEach((text) => {
      const p = document.createElement('p')
      p.textContent = text
      section.appendChild(p)
    })

    const surroundingHeading = document.createElement('p')
    surroundingHeading.textContent = '周辺地点（5km先）の低層雲の平均：'
    section.appendChild(surroundingHeading)

    const surroundingList = document.createElement('ul')
    surroundingLowCloudSummary(forecast, info.sunset, info.sunrise).forEach(
      ({ direction, averageLowCloud }) => {
        const li = document.createElement('li')
        li.textContent = `${direction}：${averageLowCloud === null ? 'データなし' : `${averageLowCloud.toFixed(0)}%`}`
        surroundingList.appendChild(li)
      }
    )
    section.appendChild(surroundingList)

    return section
  }

  function render() {
    container.innerHTML = ''

    const backButton = document.createElement('button')
    backButton.type = 'button'
    backButton.textContent = '← トップに戻る'
    backButton.addEventListener('click', () => {
      if (chartInstance) chartInstance.destroy()
      onBack()
    })
    container.appendChild(backButton)

    const heading = document.createElement('h2')
    heading.textContent = `${location.name}　${formatDate(nightDate)}`
    container.appendChild(heading)

    const modelSwitch = document.createElement('div')
    ;['msm', 'ecmwf'].forEach((modelKey) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = MODEL_LABELS[modelKey]
      button.disabled = modelKey === state.selectedModel
      button.addEventListener('click', () => {
        state.selectedModel = modelKey
        render()
      })
      modelSwitch.appendChild(button)
    })
    container.appendChild(modelSwitch)

    const observer = createObserver(location.lat, location.lng, location.elevation ?? 0)
    const info = computeNightInfo(observer, nightDate)

    const astroInfo = document.createElement('p')
    astroInfo.className = 'detail-astro-info'
    astroInfo.textContent =
      `暗い時間：${info.darkHours.toFixed(1)}h　` +
      `日没 ${formatTime(info.sunset)} → 日の出 ${formatTime(info.sunrise)}　` +
      `天文薄明　終了 ${formatTime(info.duskEnd)} 〜 開始 ${formatTime(info.dawnStart)}　` +
      `月齢 ${info.moonAgeDays.toFixed(1)}`
    container.appendChild(astroInfo)

    const forecast = findForecast(cache, state.selectedModel, location.id)
    const judgeInfo = forecast
      ? judgeModelForNight(forecast.center.hourly, info.dawnStart, info.darkIntervals)
      : { available: false }

    if (!forecast || !judgeInfo.available) {
      const p = document.createElement('p')
      p.className = 'error-message'
      p.textContent = `${MODEL_LABELS[state.selectedModel]}のこの夜のデータがありません（予報範囲外の可能性があります）`
      container.appendChild(p)
      return
    }

    renderChart(forecast.center.hourly, info, observer)

    const ecmwfForecast = findForecast(cache, 'ecmwf', location.id)
    container.appendChild(
      renderNumericInfo(forecast.center.hourly, ecmwfForecast?.center?.hourly, info, forecast)
    )
  }

  render()
}
