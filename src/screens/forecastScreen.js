// 予報データの確認用の簡易表（Step 3）。
// 正式な画面（カード表示・グラフ）はStep 5・6で作る。ここではデータが正しく取れているかの確認用。

import { fetchForecast, fetchModelUpdateInfo } from '../api/forecast.js'
import { loadForecastCache, saveForecastCache, isCacheFresh } from '../storage/forecastCache.js'

const MODEL_LABELS = { msm: 'MSM', ecmwf: 'ECMWF' }
const TIME_ZONE = 'Asia/Tokyo'

function formatDateTime(date) {
  return new Date(date).toLocaleString('ja-JP', { timeZone: TIME_ZONE })
}

export async function renderForecastScreen(container, locations) {
  const state = {
    loading: false,
    errorMessage: null,
    cache: loadForecastCache(),
  }

  async function loadData(force) {
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
      state.errorMessage = '取得できませんでした（通信エラー）'
    } finally {
      state.loading = false
      render()
    }
  }

  function renderLocationTable(location) {
    const section = document.createElement('div')
    section.className = 'forecast-table-section'

    const heading = document.createElement('h4')
    heading.textContent = location.name
    section.appendChild(heading)

    Object.keys(MODEL_LABELS).forEach((modelKey) => {
      const modelLabel = document.createElement('p')
      modelLabel.textContent = MODEL_LABELS[modelKey]
      section.appendChild(modelLabel)

      const modelResult = state.cache?.results?.[modelKey]?.find(
        (r) => r.locationId === location.id
      )
      if (!modelResult) {
        const p = document.createElement('p')
        p.textContent = 'データなし'
        section.appendChild(p)
        return
      }

      const hourly = modelResult.center.hourly
      const table = document.createElement('div')
      table.className = 'forecast-mini-table'
      hourly.time.slice(0, 24).forEach((time, i) => {
        const row = document.createElement('div')
        row.textContent = `${time}　低層${hourly.cloud_cover_low[i]}% 中層${hourly.cloud_cover_mid[i]}% 高層${hourly.cloud_cover_high[i]}%`
        table.appendChild(row)
      })
      section.appendChild(table)
    })

    return section
  }

  function render() {
    container.innerHTML = ''

    const heading = document.createElement('h2')
    heading.textContent = '予報データ（確認用）'
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

    if (state.errorMessage) {
      const p = document.createElement('p')
      p.className = 'error-message'
      p.textContent = state.cache
        ? `${state.errorMessage}。保存済みの予報を表示しています`
        : `${state.errorMessage}。保存済みのデータもありません`
      container.appendChild(p)
    }

    if (!state.cache) {
      if (!state.loading && !state.errorMessage) {
        const p = document.createElement('p')
        p.textContent = 'まだデータがありません'
        container.appendChild(p)
      }
      return
    }

    const fetchedAtText = document.createElement('p')
    fetchedAtText.textContent = `最終取得：${formatDateTime(state.cache.fetchedAt)}${state.errorMessage ? '（オフライン）' : ''}`
    container.appendChild(fetchedAtText)

    Object.entries(state.cache.modelMeta ?? {}).forEach(([key, meta]) => {
      const p = document.createElement('p')
      p.textContent = `${MODEL_LABELS[key]} 最終更新：${formatDateTime(meta.initTime)}`
      container.appendChild(p)
    })

    locations.forEach((loc) => container.appendChild(renderLocationTable(loc)))
  }

  render()
  await loadData(false)
}
