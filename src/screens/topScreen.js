// トップ画面：開いてすぐ「今週どの夜に、どこへ行けそうか」が1画面で分かるようにする。
//
//   ・上：7夜のタブ（日付・曜日・月の形・その夜いちばん良い判定）。押すと下の表が切り替わる
//   ・中：選んだ夜の要点（暗い時間・月の出入り）
//   ・下：全地点×時間の表（左に判定、右に1時間ごとの雲。黒＝晴れ／白＝曇り）。行を押すと詳細へ

import { fetchAndSaveForecast, isOffline } from '../api/forecastLoader.js'
import {
  CURRENT_LOCATION_ID,
  loadLastPosition,
  currentLocationFrom,
  requestCurrentPosition,
  isSamePlace,
} from '../api/currentLocation.js'
import { loadForecastCache, isCacheFresh } from '../storage/forecastCache.js'
import { createObserver, computeNightInfo } from '../logic/astronomy.js'
import {
  NIGHT_COUNT,
  STATUS_CLASSES,
  computeNightJudgment,
  findForecastForLocation,
} from '../logic/nightJudgment.js'
import { isForecastCoveringNight } from '../logic/judgment.js'
import { MAIN_MODELS, MODEL_INFO } from '../logic/modelInfo.js'
import { STATUS_SHORT, STATUS_CAPTION, matrixSlots, cloudAt, windAt, bestStatus } from '../logic/nightMatrix.js'
import { config } from '../config.js'
import { moonPhaseSvg } from './moonPhaseIcon.js'
import { hourLabelCell, skyCell, cloudCell } from './hourCells.js'
import {
  WEEKDAY_NAMES,
  WEEKDAY_CLASSES,
  jstParts,
  formatDateTime,
  formatTime,
  formatNightTitle,
  nightAstroText,
  judgmentText,
  el,
} from './format.js'
import { nextModelUpdate } from '../logic/modelUpdate.js'

const TIME_ZONE = 'Asia/Tokyo'
const REFERENCE_LOCATION_KEY = 'astro-dashboard.selectedLocationId.v1'
const DEFAULT_REFERENCE_NAME = '八ヶ岳ふれあい公園' // 野辺山

// 選んでいる夜（詳細画面から戻ったときなどに、選択を覚えておく）
let selectedNightIndex = 0
// 表の雲に使うモデル（'msm' / 'ecmwf'）。MSMが届かない夜（5夜目以降）は自動でECMWFを出す
let selectedMatrixModel = 'msm'
// 最後に描いたトップ画面を描き直す関数（詳細画面で夜を移ったときに、ホームの選択もそろえるため）
let redrawTop = null

/** 選んでいる夜を変える（詳細画面で前の夜・次の夜に移ったときに使う） */
export function selectNight(index) {
  selectedNightIndex = index
  redrawTop?.()
}

/** 今日から7夜ぶんの日付（各夜の正午）と、ホームで選んでいる夜（下のボタンの「詳細」で使う） */
export function getNightSelection() {
  const today = new Date()
  const nightDates = Array.from({ length: NIGHT_COUNT }, (_, i) => noonOf(addDays(today, i)))
  return { nightDates, index: Math.min(selectedNightIndex, nightDates.length - 1) }
}

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

function pickDefaultReference(locations) {
  return locations.find((loc) => loc.name === DEFAULT_REFERENCE_NAME) ?? locations[0]
}

// 基準地点に「現在地」を選んでいるか（何も選んでいなければ現在地を使う）
function wantsCurrentLocation() {
  const savedId = localStorage.getItem(REFERENCE_LOCATION_KEY)
  return savedId === null || savedId === CURRENT_LOCATION_ID
}

// トップ画面で選んでいる「基準地点」を返す（ランチャー画面でも使う）。
// 現在地を選んでいて、現在地が取れていればそれを使う。取れていなければ野辺山（または先頭の地点）を使う
export function getReferenceLocation(locations) {
  if (wantsCurrentLocation()) {
    const pos = loadLastPosition()
    if (pos) return currentLocationFrom(pos)
    return pickDefaultReference(locations)
  }
  const savedId = localStorage.getItem(REFERENCE_LOCATION_KEY)
  return locations.find((loc) => loc.id === savedId) ?? pickDefaultReference(locations)
}

export async function renderTopScreen(container, locations, { onCardClick } = {}) {
  const state = {
    loading: false,
    errorMessage: null,
    cache: loadForecastCache(),
    nights: [], // 7夜ぶんの { nightDate, refInfo, entries: [{ location, info, judgment }] }
    locating: false, // 現在地を取得中か
    locateFailed: false, // 現在地が取れなかったか（許可されなかった等）
  }

  // 現在地を取り直す。前回とほぼ同じ場所なら描き直さない（現在地を基準にしているときだけ）
  async function updateCurrentPosition() {
    if (!wantsCurrentLocation() || locations.length === 0) return
    const before = loadLastPosition()
    state.locating = true
    if (!before) render() // まだ一度も取れていなければ「取得中…」を出す
    const pos = await requestCurrentPosition()
    state.locating = false
    state.locateFailed = !pos
    if (!pos || !isSamePlace(before, pos)) render()
  }

  // 7夜×全地点の判定をまとめて計算しておく（タブを切り替えるたびに計算し直さないため）
  // 基準地点（現在地のこともある）の暗い時間・月などは、地点ごとの判定とは別に計算する
  function computeAll(referenceLocation) {
    const today = new Date()
    const refObserver = createObserver(
      referenceLocation.lat,
      referenceLocation.lng,
      referenceLocation.elevation ?? 0
    )
    state.nights = Array.from({ length: NIGHT_COUNT }, (_, i) => {
      const nightDate = noonOf(addDays(today, i))
      const entries = locations.map((location) => ({
        location,
        ...computeNightJudgment(location, nightDate, state.cache),
      }))
      return { nightDate, refInfo: computeNightInfo(refObserver, nightDate), entries }
    })
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
      state.cache = await fetchAndSaveForecast(locations)
    } catch {
      // 通信失敗（圏外など）。画面は真っ白にせず、保存済みのデータがあればそれを表示する
      state.errorMessage = '取得できませんでした'
    } finally {
      state.loading = false
      render()
    }
  }

  // 1行目：アプリ名・取得時刻・赤色モード・更新ボタン
  function renderHeader() {
    const header = el('header', 'top-header')
    header.appendChild(el('h1', 'top-title', '遠征地判断'))

    // 右寄せの2行：取得した時刻（＋オフラインの札）／MSMの次の予報が出る時刻の目安
    const status = el('div', 'top-status')
    let fetchedText = ''
    if (state.loading) fetchedText = '取得中…'
    else if (state.cache) fetchedText = `${formatDateTime(state.cache.fetchedAt)} 取得`
    const fetchedLine = el('span', 'top-status-line', fetchedText)
    if (state.errorMessage && state.cache && !state.loading) {
      fetchedLine.appendChild(el('span', 'badge badge-offline', 'オフライン'))
    }
    status.appendChild(fetchedLine)

    const msmNext = nextModelUpdate(state.cache?.modelMeta?.msm, new Date(), state.cache?.fetchedAt)
    if (msmNext && !state.loading) {
      const texts = {
        waiting: `MSM次回 ${formatTime(msmNext.nextAvailable)}ごろ`,
        // 次の予報が出ているはずの時刻を過ぎている＝更新ボタンで新しい予報が取れる
        newer: 'MSM 新しい予報あり',
        // 目安の時刻を過ぎてから取りに行ったが、まだ公開されていなかった
        delayed: 'MSM次回 まもなく',
      }
      const nextLine = el(
        'span',
        `top-status-line${msmNext.status === 'newer' ? ' is-newer' : ''}`,
        texts[msmNext.status]
      )
      nextLine.title = 'MSM（気象庁）の次の予報が出る時刻の目安'
      status.appendChild(nextLine)
    }
    header.appendChild(status)


    const refreshButton = el('button', 'icon-button refresh-button')
    refreshButton.type = 'button'
    // 更新のアイコン（外部から読み込まず、ここで直接描く）
    refreshButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>'
    refreshButton.setAttribute('aria-label', '更新')
    refreshButton.title = '予報を取得し直す'
    refreshButton.disabled = state.loading
    refreshButton.addEventListener('click', () => loadData(true))
    header.appendChild(refreshButton)

    return header
  }

  // 通信に失敗したときのお知らせ（保存済みデータを出しているかどうかも書く）
  function renderNotice() {
    const notice = el('div', 'top-notice')
    notice.appendChild(
      el(
        'p',
        'error-message',
        state.cache
          ? `${state.errorMessage}。保存済みの予報を表示しています`
          : `${state.errorMessage}。保存済みのデータもありません`
      )
    )
    if (state.cache) {
      notice.appendChild(
        el('p', 'muted', `${formatDateTime(state.cache.fetchedAt)}時点のデータ（オフライン）`)
      )
    }
    return notice
  }

  // 7夜のタブ。その夜、登録地点の中でいちばん良い判定を出す
  function renderNightTabs() {
    const tabs = el('div', 'night-tabs')
    tabs.setAttribute('role', 'tablist')

    state.nights.forEach((night, index) => {
      const p = jstParts(night.nightDate)
      const status = bestStatus(night.entries.map((e) => e.judgment.status))

      const tab = el('button', 'night-tab')
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(index === selectedNightIndex))
      if (index === selectedNightIndex) tab.classList.add('is-selected')

      const date = el('span', 'night-tab-date num', `${p.month}/${p.day}`)
      const weekday = el('span', `night-tab-weekday ${WEEKDAY_CLASSES[p.weekday] ?? ''}`, WEEKDAY_NAMES[p.weekday])
      const moon = el('span', 'night-tab-moon')
      moon.innerHTML = moonPhaseSvg(night.refInfo.moonAgeDays)
      const symbol = el('span', `night-tab-status ${STATUS_CLASSES[status]}`, STATUS_SHORT[status])
      const caption = el('span', 'night-tab-caption', STATUS_CAPTION[status] ?? '')

      tab.append(date, weekday, moon, symbol, caption)
      tab.addEventListener('click', () => {
        selectedNightIndex = index
        render()
      })
      tabs.appendChild(tab)
    })
    return tabs
  }

  // 選んだ夜の要点（基準地点の暗い時間・月の出入り・月齢）と、基準地点の切り替え
  function renderSummary(night, referenceLocation) {
    const info = night.refInfo
    const summary = el('section', 'night-summary')

    const line1 = el('div', 'night-summary-main')
    line1.appendChild(el('span', 'night-summary-date', formatNightTitle(night.nightDate)))
    line1.appendChild(el('span', 'night-summary-dark num', `暗い時間 ${info.darkHours.toFixed(1)}h`))
    summary.appendChild(line1)

    summary.appendChild(el('div', 'night-summary-sub num', nightAstroText(info)))

    // 基準地点（暗い時間・表の時刻の目安にする地点）の切り替え
    const refRow = el('label', 'night-summary-ref')
    refRow.appendChild(el('span', 'muted', '基準'))
    const select = el('select', 'compact-select')
    // 先頭は「現在地」（スマホの位置情報）。取れていないときは状態を添える
    let currentLabel = '現在地'
    if (wantsCurrentLocation() && referenceLocation.id !== CURRENT_LOCATION_ID) {
      currentLabel = state.locating
        ? '現在地（取得中…）'
        : `現在地（取得できず：${referenceLocation.name}で表示中）`
    }
    const currentOption = el('option', null, currentLabel)
    currentOption.value = CURRENT_LOCATION_ID
    currentOption.selected = wantsCurrentLocation()
    select.appendChild(currentOption)
    locations.forEach((loc) => {
      const option = el('option', null, loc.name)
      option.value = loc.id
      option.selected = !wantsCurrentLocation() && loc.id === referenceLocation.id
      select.appendChild(option)
    })
    select.addEventListener('change', (e) => {
      localStorage.setItem(REFERENCE_LOCATION_KEY, e.target.value)
      render()
      if (e.target.value === CURRENT_LOCATION_ID) updateCurrentPosition()
    })
    refRow.appendChild(select)
    summary.appendChild(refRow)

    return summary
  }

  // 全地点×時間の表。1つのグリッドにまとめて、全部の行の時刻の列がぴったり揃うようにする
  // その夜に、そのモデルの予報が夜の終わりまで届いているか（どれか1地点でも届いていれば true）
  function modelCoversNight(night, model) {
    return night.entries.some(({ location, info }) => {
      const hourly = findForecastForLocation(state.cache, model, location.id)?.center?.hourly
      return hourly && isForecastCoveringNight(hourly, info.dawnStart)
    })
  }

  // 表の上のモデル切り替え（MSM／ECMWF）。MSMが届かない夜はMSMを押せなくして、ECMWFを出す
  function renderMatrixModelSwitch(effectiveModel, msmAvailable) {
    const switcher = el('div', 'segmented matrix-model-switch')
    switcher.setAttribute('role', 'group')
    switcher.setAttribute('aria-label', '表に出す雲の予報（モデル）')
    MAIN_MODELS.forEach((model) => {
      const button = el('button', 'segmented-button', MODEL_INFO[model].label)
      button.type = 'button'
      button.setAttribute('aria-pressed', String(model === effectiveModel))
      if (model === 'msm' && !msmAvailable) {
        button.disabled = true
        button.title = 'この夜はMSMの予報が届いていません（4日先まで）'
      }
      button.addEventListener('click', () => {
        selectedMatrixModel = model
        render()
      })
      switcher.appendChild(button)
    })
    return switcher
  }

  function renderMatrix(night) {
    const refInfo = night.refInfo
    const slots = matrixSlots(refInfo)

    const msmAvailable = modelCoversNight(night, 'msm')
    const effectiveModel = selectedMatrixModel === 'msm' && !msmAvailable ? 'ecmwf' : selectedMatrixModel

    const section = el('section', 'matrix-section')
    section.appendChild(renderMatrixModelSwitch(effectiveModel, msmAvailable))
    const grid = el('div', 'matrix')
    grid.style.gridTemplateColumns = `var(--matrix-label-width) repeat(${slots.length}, 1fr)`

    // 1行目：時刻
    grid.appendChild(el('div', 'matrix-corner'))
    slots.forEach((slot) => grid.appendChild(hourLabelCell(slot)))

    // 2行目：空の状態（暗い／月あり／薄明）
    grid.appendChild(el('div', 'matrix-row-label matrix-sky-label', '空'))
    slots.forEach((slot) => grid.appendChild(skyCell(slot, refInfo)))

    // 3行目以降：地点ごと
    night.entries.forEach(({ location, info, judgment }) => {
      const row = el('div', 'matrix-row')
      row.setAttribute('role', 'button')
      row.tabIndex = 0
      row.setAttribute('aria-label', `${location.name}の詳細を開く`)

      const label = el('div', 'matrix-row-label')
      label.appendChild(el('span', 'matrix-location-name', location.name))
      const judgeLine = el(
        'span',
        `matrix-judgment ${STATUS_CLASSES[judgment.status]}`,
        judgmentText(judgment)
      )
      if (judgment.lowCloudRisk) {
        judgeLine.appendChild(el('span', 'matrix-warning', ' ⚠'))
      }
      label.appendChild(judgeLine)
      row.appendChild(label)

      // 表の雲と風は、選んでいるモデルの予報（届いていなければマスは空）
      const hourly = findForecastForLocation(state.cache, effectiveModel, location.id)?.center?.hourly
      const forecast =
        hourly && isForecastCoveringNight(hourly, info.dawnStart) ? { hourly } : null
      slots.forEach((slot) => {
        const cloud = forecast ? cloudAt(forecast.hourly, slot) : null
        // マスの色＝雲（3層のうち一番多い雲量）、中の小さな数字＝その時間の風速（m/s）
        const cell = cloudCell({
          percent: cloud?.max,
          isClear: cloud?.isClear,
          title: cloud
            ? `${jstParts(slot).hour}時台：低${cloud.low}% 中${cloud.mid}% 高${cloud.high}%`
            : '',
          windMs: forecast ? windAt(forecast.hourly, slot) : null,
        })
        row.appendChild(cell)
      })

      if (onCardClick) {
        // 詳細画面で前の夜・次の夜に移れるよう、7夜ぶんの日付も一緒に渡す
        const open = () =>
          onCardClick(location, night.nightDate, {
            nightDates: state.nights.map((n) => n.nightDate),
          })
        row.addEventListener('click', open)
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') open()
        })
      }
      grid.appendChild(row)
    })

    section.appendChild(grid)

    // 凡例（1画面に収まるよう、横に並べて詰める）
    // 1段目：マスの色・空の帯・風速、2段目：判定の記号
    const legend = el('div', 'matrix-legend')
    legend.innerHTML = `
      <span><i class="legend-swatch legend-clear"></i>晴（全層${config.cloudCoverClearMax}%以下）</span>
      <span><i class="legend-swatch legend-cloudy"></i>曇</span>
      <span><i class="legend-swatch sky-dark"></i>暗い</span>
      <span><i class="legend-swatch sky-moon"></i>月</span>
      <span><i class="legend-swatch sky-twilight"></i>薄明</span>
      <span><b class="legend-wind num">3</b>風m/s（<b class="legend-wind text-caution">黄</b>＝${config.windCautionThreshold}・<b class="legend-wind text-danger">赤</b>＝${config.windDangerThreshold}以上）</span>
    `
    section.appendChild(legend)

    const judgeLegend = el('div', 'matrix-legend judgment-legend-inline')
    judgeLegend.innerHTML = `
      <span><b class="judgment-go">◎</b>可（2モデルとも${config.minClearHours}h以上）</span>
      <span><b class="judgment-split">△</b>割れ（MSM/ECMWF）</span>
      <span><b class="judgment-no-go">×</b>不可</span>
      <span><b class="judgment-reference-go">○</b>参考：可（ECMWFのみ）</span>
      <span><b class="matrix-warning">⚠</b>周辺5kmに低層雲</span>
    `
    section.appendChild(judgeLegend)
    return section
  }

  function render() {
    container.innerHTML = ''
    container.appendChild(renderHeader())

    if (locations.length === 0) {
      container.appendChild(
        el('p', 'empty-message', '地点が登録されていません。下の「設定」の地点管理から追加してください。')
      )
      return
    }

    if (state.errorMessage && !state.loading) {
      container.appendChild(renderNotice())
    }
    if (state.cache?.notSaved && !state.loading) {
      container.appendChild(
        el(
          'p',
          'error-message top-notice',
          '予報を端末に保存できませんでした（圏外では、この予報を表示できません）'
        )
      )
    }

    const referenceLocation = getReferenceLocation(locations)
    computeAll(referenceLocation)
    selectedNightIndex = Math.min(selectedNightIndex, state.nights.length - 1)
    const night = state.nights[selectedNightIndex]

    container.appendChild(renderNightTabs())
    container.appendChild(renderSummary(night, referenceLocation))
    container.appendChild(renderMatrix(night))
  }

  redrawTop = render
  render()
  // 現在地の取得（許可の確認が出ることがある）と予報の取得は、並行して進める
  updateCurrentPosition()
  await loadData(false)
}
