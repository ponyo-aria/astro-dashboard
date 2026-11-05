// トップ画面：登録地点ごとに、今後7夜分のカードを横スクロールで表示する。

import { fetchForecast, fetchModelUpdateInfo } from '../api/forecast.js'
import { loadForecastCache, saveForecastCache, isCacheFresh } from '../storage/forecastCache.js'
import {
  NIGHT_COUNT,
  STATUS_LABELS,
  STATUS_CLASSES,
  computeNightJudgment,
} from '../logic/nightJudgment.js'

const TIME_ZONE = 'Asia/Tokyo'
const MODEL_LABELS = { msm: 'MSM', ecmwf: 'ECMWF' }
const REFERENCE_LOCATION_KEY = 'astro-dashboard.selectedLocationId.v1'
const DEFAULT_REFERENCE_NAME = '八ヶ岳ふれあい公園' // 野辺山

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

function formatDateTime(date) {
  return new Date(date).toLocaleString('ja-JP', { timeZone: TIME_ZONE })
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

function clearHoursOf(judgment) {
  const hours = judgment.msm?.clearHours ?? judgment.ecmwf?.clearHours
  return typeof hours === 'number' ? `${hours.toFixed(1)}h` : '―'
}

// 端末が圏外かどうか（ブラウザが「オフライン」と判断しているとき true）
function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function pickDefaultReference(locations) {
  return locations.find((loc) => loc.name === DEFAULT_REFERENCE_NAME) ?? locations[0]
}

// トップ画面で選んでいる「基準地点」を返す（ランチャー画面でも使う）
export function getReferenceLocation(locations) {
  const savedId = localStorage.getItem(REFERENCE_LOCATION_KEY)
  return locations.find((loc) => loc.id === savedId) ?? pickDefaultReference(locations)
}

/**
 * 複数地点の横スクロールを連動させる（どれか1つをスクロールすると、他の地点も同じ位置まで動く）。
 * 同じ日付の列を縦に見比べやすくするため。
 */
function setupSyncedScroll(container) {
  const tables = [...container.querySelectorAll('.nights-table')]
  let isSyncing = false

  tables.forEach((table) => {
    table.addEventListener('scroll', () => {
      if (isSyncing) return
      isSyncing = true
      tables.forEach((other) => {
        if (other !== table) {
          other.scrollLeft = table.scrollLeft
        }
      })
      isSyncing = false
    })
  })
}

export async function renderTopScreen(container, locations, { onCardClick } = {}) {
  const state = {
    loading: false,
    errorMessage: null,
    cache: loadForecastCache(),
  }

  async function loadData(force) {
    if (locations.length === 0) {
      render()
      return
    }
    // 圏外（機内モードなど）と分かっているときは通信せず、保存済みの予報を「オフライン」表示で出す
    if (isOffline()) {
      state.errorMessage = 'オフラインのため取得できませんでした'
      render()
      return
    }
    if (!force && isCacheFresh(state.cache)) {
      render()
      return
    }

    state.loading = true
    state.errorMessage = null
    render()

    try {
      const [msmResults, ecmwfResults, msmMeta, ecmwfMeta] = await Promise.all([
        fetchForecast('msm', locations),
        fetchForecast('ecmwf', locations),
        fetchModelUpdateInfo('msm'),
        fetchModelUpdateInfo('ecmwf'),
      ])
      const cache = {
        fetchedAt: Date.now(),
        results: { msm: msmResults, ecmwf: ecmwfResults },
        modelMeta: { msm: msmMeta, ecmwf: ecmwfMeta },
      }
      saveForecastCache(cache)
      state.cache = cache
    } catch (err) {
      // 通信失敗（圏外など）。画面は真っ白にせず、保存済みのデータがあればそれを表示する
      state.errorMessage = '取得できませんでした'
    } finally {
      state.loading = false
      render()
    }
  }

  // 日付・暗い時間・日没日の出・天文薄明は、近場の地点ではほとんど差が無いため、
  // 基準地点1つぶんだけ上部にまとめて表示する（地点ごとのカードでは繰り返さない）。
  function renderReferenceBlock(referenceLocation, locations) {
    const wrapper = document.createElement('div')
    wrapper.className = 'nights-section'

    const label = document.createElement('p')
    label.textContent = '基準地点（暗い時間・日没・薄明の目安）'
    wrapper.appendChild(label)

    const select = document.createElement('select')
    locations.forEach((loc) => {
      const option = document.createElement('option')
      option.value = loc.id
      option.textContent = loc.name
      if (loc.id === referenceLocation.id) {
        option.selected = true
      }
      select.appendChild(option)
    })
    select.addEventListener('change', (e) => {
      localStorage.setItem(REFERENCE_LOCATION_KEY, e.target.value)
      render()
    })
    wrapper.appendChild(select)

    const table = document.createElement('div')
    table.className = 'nights-table'

    const today = new Date()
    for (let i = 0; i < NIGHT_COUNT; i += 1) {
      const nightDate = noonOf(addDays(today, i))
      const { info } = computeNightJudgment(referenceLocation, nightDate, state.cache)

      const row = document.createElement('div')
      row.className = 'nights-row'
      row.innerHTML = `
        <div class="nights-row-date">${formatDate(nightDate)}</div>
        <div class="nights-row-detail">
          暗い時間：${info.darkHours.toFixed(1)}h<br>
          日没 ${formatTime(info.sunset)} → 日の出 ${formatTime(info.sunrise)}<br>
          天文薄明　終了 ${formatTime(info.duskEnd)} 〜 開始 ${formatTime(info.dawnStart)}<br>
          月齢：${info.moonAgeDays.toFixed(1)}
        </div>
      `
      table.appendChild(row)
    }

    wrapper.appendChild(table)
    return wrapper
  }

  // 地点ごとのカードは、その地点特有の情報（判定・撮影可能時間・低層雲リスク）だけを表示する
  function renderLocationRow(location) {
    const section = document.createElement('div')
    section.className = 'nights-section'

    const heading = document.createElement('h3')
    heading.textContent = location.name
    section.appendChild(heading)

    const table = document.createElement('div')
    table.className = 'nights-table'

    const today = new Date()
    for (let i = 0; i < NIGHT_COUNT; i += 1) {
      const nightDate = noonOf(addDays(today, i))
      const { judgment } = computeNightJudgment(location, nightDate, state.cache)

      // 日付は基準地点ブロックに1回だけ表示し、横スクロールが連動するのでここでは繰り返さない
      const row = document.createElement('div')
      row.className = 'nights-row nights-row-clickable'
      row.innerHTML = `
        <div class="nights-row-judgment ${STATUS_CLASSES[judgment.status]}">${STATUS_LABELS[judgment.status]}${judgment.lowCloudRisk ? ' ⚠' : ''}</div>
        <div class="nights-row-detail">撮影可能時間：${clearHoursOf(judgment)}</div>
      `
      if (onCardClick) {
        row.addEventListener('click', () => onCardClick(location, nightDate))
      }
      table.appendChild(row)
    }

    section.appendChild(table)
    return section
  }

  function render() {
    container.innerHTML = ''

    const heading = document.createElement('h2')
    heading.textContent = '遠征地判断'
    container.appendChild(heading)

    const refreshButton = document.createElement('button')
    refreshButton.type = 'button'
    refreshButton.textContent = '更新'
    refreshButton.disabled = state.loading
    refreshButton.addEventListener('click', () => loadData(true))
    container.appendChild(refreshButton)

    if (state.loading) {
      const p = document.createElement('p')
      p.textContent = '取得中…'
      container.appendChild(p)
    }

    if (locations.length === 0) {
      const p = document.createElement('p')
      p.textContent = '地点が登録されていません。「地点管理」から追加してください。'
      container.appendChild(p)
      return
    }

    if (state.errorMessage) {
      const p = document.createElement('p')
      p.className = 'error-message'
      p.textContent = state.cache
        ? `${state.errorMessage}。保存済みの予報を表示しています`
        : `${state.errorMessage}。保存済みのデータもありません`
      container.appendChild(p)
    }

    if (state.cache) {
      const fetchedAtText = document.createElement('p')
      fetchedAtText.textContent = `${formatDateTime(state.cache.fetchedAt)}時点のデータ${state.errorMessage ? '（オフライン）' : ''}`
      container.appendChild(fetchedAtText)

      Object.entries(state.cache.modelMeta ?? {}).forEach(([key, meta]) => {
        const p = document.createElement('p')
        const nextUpdate = new Date(new Date(meta.initTime).getTime() + meta.updateIntervalSeconds * 1000)
        p.textContent = `${MODEL_LABELS[key]} 最終更新：${formatDateTime(meta.initTime)}（次は${formatDateTime(nextUpdate)}ごろ）`
        container.appendChild(p)
      })
    }

    const referenceLocation = getReferenceLocation(locations)
    container.appendChild(renderReferenceBlock(referenceLocation, locations))

    locations.forEach((loc) => container.appendChild(renderLocationRow(loc)))
    setupSyncedScroll(container)
  }

  render()
  await loadData(false)
}
