// モデル比較画面：地点ごとに、夜×モデルの撮影可能時間を並べて見比べる。
//
//   ・上の欄：ホームと同じ形（タイトル・取得時刻・更新ボタン）
//   ・モデルの説明：どんなモデルか（範囲・細かさ）と、予報の更新時刻
//   ・地点ごとの表：日付｜MSM｜ECMWF｜GSM｜AIFS｜判定。時間を大きく出し、晴れの割合を横棒で示す。
//     判定（◎△×）は今までどおり MSM・ECMWF だけで決める。GSM・AIFS は「参考」として控えめに並べ、
//     予報が割れた夜に「ほかのモデルはどちら寄りか」を確かめるのに使う。
//     MSM・ECMWFの判定が割れた夜は、行の左に黄色い線を引く

import { fetchAndSaveForecast, isOffline } from '../api/forecastLoader.js'
import { loadForecastCache } from '../storage/forecastCache.js'
import {
  NIGHT_COUNT,
  STATUS_CLASSES,
  computeNightJudgment,
  findForecastForLocation,
} from '../logic/nightJudgment.js'
import { judgeModelForNight } from '../logic/judgment.js'
import { ALL_MODELS, REFERENCE_MODELS, MODEL_INFO, isReferenceModel } from '../logic/modelInfo.js'
import { STATUS_SHORT, STATUS_CAPTION } from '../logic/nightMatrix.js'
import { nextModelUpdate } from '../logic/modelUpdate.js'
import { config } from '../config.js'
import {
  WEEKDAY_NAMES,
  WEEKDAY_CLASSES,
  jstParts,
  formatDateTime,
  formatTime,
  formatHours,
  el,
} from './format.js'

const TIME_ZONE = 'Asia/Tokyo'

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

/**
 * onUpdated：更新ボタンで予報を取り直したときに呼ばれる（ホーム画面にも反映するため）
 * onOpenDetail(location, nightDate, { nightDates, model })：行が押されたときに呼ばれる（詳細を開く）
 */
export function renderModelCompareScreen(container, locations, { onUpdated, onOpenDetail } = {}) {
  const state = { loading: false, errorMessage: null, cache: loadForecastCache() }

  async function refresh() {
    if (locations.length === 0) return
    if (isOffline()) {
      state.errorMessage = 'オフラインのため取得できませんでした'
      render()
      return
    }
    state.loading = true
    state.errorMessage = null
    render()
    try {
      state.cache = await fetchAndSaveForecast(locations)
      onUpdated?.()
    } catch {
      state.errorMessage = '取得できませんでした'
    } finally {
      state.loading = false
      render()
    }
  }

  // 上の欄（ホームと同じ形）
  function renderHeader() {
    const header = el('header', 'top-header')
    header.appendChild(el('h1', 'top-title', 'モデル比較'))

    const status = el('div', 'top-status')
    let text = ''
    if (state.loading) text = '取得中…'
    else if (state.cache) text = `${formatDateTime(state.cache.fetchedAt)} 取得`
    const line = el('span', 'top-status-line', text)
    if (state.errorMessage && state.cache && !state.loading) {
      line.appendChild(el('span', 'badge badge-offline', 'オフライン'))
    }
    status.appendChild(line)
    header.appendChild(status)

    const refreshButton = el('button', 'icon-button refresh-button')
    refreshButton.type = 'button'
    refreshButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>'
    refreshButton.setAttribute('aria-label', '更新')
    refreshButton.title = '予報を取得し直す'
    refreshButton.disabled = state.loading || locations.length === 0
    refreshButton.addEventListener('click', refresh)
    header.appendChild(refreshButton)
    return header
  }

  // モデルの説明と、予報の更新時刻
  function renderModelInfo() {
    const card = el('section', 'card compare-models')
    ALL_MODELS.forEach((key) => {
      const { label, description, note } = MODEL_INFO[key]
      const row = el('div', `compare-model-row${isReferenceModel(key) ? ' is-reference' : ''}`)
      row.appendChild(el('span', `model-chip model-${key}`, label))
      const texts = el('div', 'compare-model-texts')
      const desc = el('span', 'compare-model-desc', description)
      if (isReferenceModel(key)) desc.prepend(el('span', 'reference-tag', '参考'))
      texts.appendChild(desc)

      // 使っている予報が何時のものか（1行目）と、次の予報が出る時刻の目安（2行目）
      const meta = state.cache?.modelMeta?.[key]
      const next = nextModelUpdate(meta, new Date(), state.cache?.fetchedAt)
      texts.appendChild(
        el(
          'span',
          'compare-model-update num',
          meta
            ? `${formatTime(meta.initTime)}の予報・${formatTime(meta.availableTime)}に公開`
            : '更新時刻：―'
        )
      )
      if (next) {
        texts.appendChild(
          {
            waiting: el('span', 'compare-model-update num', `次の予報は ${formatTime(next.nextAvailable)}ごろ`),
            newer: el('span', 'compare-model-update is-newer', '新しい予報あり（右上の更新ボタンで取得）'),
            delayed: el(
              'span',
              'compare-model-update num',
              `次の予報は ${formatTime(next.nextAvailable)}予定・公開待ち`
            ),
          }[next.status]
        )
      }
      if (note) texts.appendChild(el('span', 'compare-model-update compare-model-note', note))
      row.appendChild(texts)
      card.appendChild(row)
    })
    card.appendChild(
      el(
        'p',
        'compare-legend muted',
        `数字＝撮影可能時間（${config.minClearHours}h以上で可）　棒＝晴れが続く割合`
      )
    )
    card.appendChild(
      el('p', 'compare-legend-sub muted', '判定（◎△×）はMSM・ECMWFで決定。GSM・AIFSは参考')
    )
    if (onOpenDetail) {
      card.appendChild(
        el('p', 'compare-legend-sub muted', '行を押すと詳細へ（モデルのマスはそのモデルで表示）')
      )
    }
    return card
  }

  // その夜・そのモデルの撮影可能時間（予報が無いモデルは null）
  function modelResult(modelKey, location, info) {
    const hourly = findForecastForLocation(state.cache, modelKey, location.id)?.center?.hourly
    if (!hourly) return null
    return judgeModelForNight(hourly, info.dawnStart, info.darkIntervals)
  }

  // モデルごとのマス
  function modelCell(modelKey, result, darkHours) {
    const td = el('td', 'compare-cell')
    if (isReferenceModel(modelKey)) td.classList.add('is-reference')
    if (modelKey === REFERENCE_MODELS[0]) td.classList.add('is-ref-start') // 参考の列の始まりに区切り線
    if (!result?.available) {
      td.classList.add('is-out')
      // 予報そのものが無い（取得できなかった）ときは「―」、夜の途中で予報が切れているときは「範囲外」
      td.appendChild(el('span', 'compare-out', result ? '範囲外' : '―'))
      return td
    }
    td.classList.add(result.isGo ? 'is-go' : 'is-no-go')
    td.dataset.model = modelKey // 押したときに、このモデルで詳細を開く
    td.appendChild(el('span', 'compare-hours num', formatHours(result.clearHours)))
    const bar = el('span', 'compare-bar')
    const fill = el('i')
    const ratio = darkHours > 0 ? Math.min(1, result.clearHours / darkHours) : 0
    fill.style.width = `${Math.round(ratio * 100)}%`
    bar.appendChild(fill)
    td.appendChild(bar)
    return td
  }

  function renderLocationTable(location, nightDates) {
    const section = el('section', 'compare-section')
    section.appendChild(el('h3', 'compare-location', location.name))

    const table = el('table', 'compare-table')
    // 列の幅を決めておく（4つのモデルの列はすべて同じ幅にして、横棒の長さで見比べられるようにする）
    const colgroup = el('colgroup')
    colgroup.appendChild(el('col', 'col-date'))
    ALL_MODELS.forEach(() => colgroup.appendChild(el('col', 'col-model')))
    colgroup.appendChild(el('col', 'col-judge'))
    table.appendChild(colgroup)
    const thead = el('thead')
    thead.innerHTML =
      '<tr><th></th><th colspan="2" class="compare-group">判定に使う</th>' +
      '<th colspan="2" class="compare-group is-reference is-ref-start">参考</th><th></th></tr>' +
      '<tr><th>日付</th>' +
      ALL_MODELS.map(
        (key) =>
          `<th class="${isReferenceModel(key) ? 'is-reference' : ''}${key === REFERENCE_MODELS[0] ? ' is-ref-start' : ''}"><span class="model-chip model-${key}">${MODEL_INFO[key].label}</span></th>`
      ).join('') +
      '<th>判定</th></tr>'
    table.appendChild(thead)

    const tbody = el('tbody')
    nightDates.forEach((nightDate) => {
      const { info, judgment } = computeNightJudgment(location, nightDate, state.cache)
      const row = el('tr')
      if (judgment.status === 'split') row.classList.add('is-split')

      const p = jstParts(nightDate)
      const dateCell = el('td', 'compare-date num')
      dateCell.appendChild(document.createTextNode(`${p.month}/${p.day}`))
      dateCell.appendChild(
        el('span', `compare-weekday ${WEEKDAY_CLASSES[p.weekday] ?? ''}`, WEEKDAY_NAMES[p.weekday])
      )
      row.appendChild(dateCell)

      ALL_MODELS.forEach((key) =>
        row.appendChild(modelCell(key, modelResult(key, location, info), info.darkHours))
      )

      // 判定（ホームと同じ記号）
      const judgeCell = el('td', 'compare-judge')
      judgeCell.appendChild(
        el('span', `compare-symbol ${STATUS_CLASSES[judgment.status]}`, STATUS_SHORT[judgment.status])
      )
      if (judgment.lowCloudRisk) judgeCell.appendChild(el('span', 'matrix-warning', '⚠'))
      const caption = STATUS_CAPTION[judgment.status]
      if (caption) judgeCell.appendChild(el('span', 'compare-caption', caption))
      row.appendChild(judgeCell)

      // 行を押すと詳細を開く。MSM・ECMWFのマスを押したときは、そのモデルの表示で開く
      if (onOpenDetail) {
        row.classList.add('is-clickable')
        row.tabIndex = 0
        row.setAttribute('aria-label', `${location.name} ${p.month}/${p.day}の詳細を開く`)
        const open = (event) => {
          const model = event.target.closest?.('td')?.dataset.model ?? null
          onOpenDetail(location, nightDate, { nightDates, model })
        }
        row.addEventListener('click', open)
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') open(e)
        })
      }

      tbody.appendChild(row)
    })
    table.appendChild(tbody)
    section.appendChild(table)
    return section
  }

  function render() {
    container.innerHTML = ''
    container.appendChild(renderHeader())

    if (locations.length === 0) {
      container.appendChild(
        el('p', 'empty-message', '地点が登録されていません。下の「地点」から追加してください。')
      )
      return
    }

    if (state.errorMessage && !state.loading) {
      container.appendChild(
        el(
          'p',
          'error-message top-notice',
          state.cache
            ? `${state.errorMessage}。保存済みの予報を表示しています`
            : `${state.errorMessage}。保存済みのデータもありません`
        )
      )
    }

    if (!state.cache) {
      container.appendChild(
        el('p', 'empty-message', 'まだ予報データがありません。右上の更新ボタンを押してください。')
      )
      return
    }

    container.appendChild(renderModelInfo())

    const today = new Date()
    const nightDates = Array.from({ length: NIGHT_COUNT }, (_, i) => noonOf(addDays(today, i)))
    locations.forEach((location) => container.appendChild(renderLocationTable(location, nightDates)))
  }

  render()
}
