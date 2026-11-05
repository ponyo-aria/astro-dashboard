// 地点詳細画面：1地点・1夜ぶんの詳しい情報。ホーム画面と同じ部品・同じ見た目で、
// スクロールせずに1画面（Galaxy S24）に収まるように並べる。
//
//   ・上：「天気詳細」／地点名（押すと切り替え）、‹ 日付 ›（前の夜・次の夜）と「今夜」
//   ・要点カード：判定とモデルごとの撮影可能時間、暗い時間・月・日没・天文薄明
//   ・1時間ごとの表：空の状態・高層／中層／低層の雲・風速・月の高さ（ホームの表と同じ時刻・同じマス）
//   ・数値の情報（3列×2段）：降水量・最低気温・結露・風・雲が流れてくる方向・周辺5kmの低層雲

import { Chart } from 'chart.js/auto'
import annotationPlugin from 'chartjs-plugin-annotation'
import { config } from '../config.js'
import { createObserver, computeNightInfo, getMoonAltitude } from '../logic/astronomy.js'
import {
  STATUS_CLASSES,
  computeNightJudgment,
  findForecastForLocation,
} from '../logic/nightJudgment.js'
import { judgeModelForNight } from '../logic/judgment.js'
import { ALL_MODELS, MODEL_INFO, isReferenceModel } from '../logic/modelInfo.js'
import {
  worstLevel,
  windLevel,
  gustLevel,
  dewLevel,
  lowCloudLevel,
  rainLevel,
} from '../logic/levels.js'
import { matrixSlots, cloudAt, windAt } from '../logic/nightMatrix.js'
import {
  recentRain,
  minNightTemperature,
  dewPointRisk,
  nightWindInfo,
  representativeWindDirection850,
  directionLabel,
  surroundingLowCloudMax,
} from '../logic/detailStats.js'
import { hourLabelCell, skyCell, cloudCell } from './hourCells.js'
import { moonPhaseSvg } from './moonPhaseIcon.js'
import {
  el,
  jstParts,
  formatTime,
  formatHours,
  formatNightTitle,
  judgmentText,
} from './format.js'

Chart.register(annotationPlugin)

const HOUR_MS = 60 * 60 * 1000

// 雲は実際の空と同じように、上から高層・中層・低層の順に並べる
const CLOUD_LAYERS = [
  { key: 'high', label: '高層' },
  { key: 'mid', label: '中層' },
  { key: 'low', label: '低層' },
]

/**
 * nightDates：前の夜・次の夜に移るための、7夜ぶんの日付の一覧（ホーム画面と同じもの）
 * initialModel：最初に表示するモデル（'msm' / 'ecmwf'。省略時は自動）
 * locations：上の地点名から切り替えられる地点の一覧（登録地点）
 * onLocationChange(location)：地点を切り替えたときに呼ばれる
 * onNightChange(index, nightDate)：前の夜・次の夜に移ったときに呼ばれる
 */
export function renderDetailScreen(
  container,
  {
    location: initialLocation,
    locations = [initialLocation],
    nightDate,
    nightDates = [nightDate],
    initialModel = null,
    cache,
    onNightChange,
    onLocationChange,
  }
) {
  // 表示している地点（上の地点名から切り替えられる）
  let location = initialLocation
  let chartInstance = null

  const state = {
    // 表示するモデル。null のときは、その夜にMSMの予報が届いていればMSM、なければECMWFを自動で選ぶ
    // （比較画面でMSM・ECMWFのマスを押して開いたときは、そのモデルで開く）
    selectedModel: initialModel,
    nightIndex: Math.max(
      0,
      nightDates.findIndex((d) => d.getTime() === nightDate.getTime())
    ),
  }
  const currentNight = () => nightDates[state.nightIndex] ?? nightDate

  // 指定した夜（0＝今夜）へ移る
  function goToNight(index) {
    if (index < 0 || index >= nightDates.length || index === state.nightIndex) return
    state.nightIndex = index
    state.selectedModel = null // 夜を移ったら、その夜に合うモデルを選び直す
    onNightChange?.(index, currentNight())
    render()
  }

  // 上の欄。1段目：「天気詳細」（ほかの画面と同じ形のタイトル）／地点名、2段目：‹ 日付 › と「今夜」。
  // 戻るボタンは置かない（下のボタンとスマホの戻る操作で移れるため：2026-11-05 オーナー指示）
  function renderHeader() {
    const header = el('header', 'top-header detail-header')
    header.appendChild(el('h1', 'top-title', '天気詳細'))
    // 地点名：押すと登録地点の一覧が出て、同じ夜のまま別の地点に切り替えられる
    const title = el('label', 'detail-title detail-location-picker')
    const select = el('select', 'detail-location-select')
    select.setAttribute('aria-label', '表示する地点')
    locations.forEach((loc) => {
      const option = el('option', null, loc.name)
      option.value = loc.id
      option.selected = loc.id === location.id
      select.appendChild(option)
    })
    select.addEventListener('change', (e) => {
      const next = locations.find((loc) => loc.id === e.target.value)
      if (!next || next.id === location.id) return
      location = next
      onLocationChange?.(next)
      render()
    })
    title.appendChild(select)
    header.appendChild(title)

    const dateRow = el('div', 'detail-date-row')
    const stepButton = (label, aria, index) => {
      const button = el('button', 'night-step', label)
      button.type = 'button'
      button.setAttribute('aria-label', aria)
      button.disabled = index < 0 || index >= nightDates.length
      button.addEventListener('click', () => goToNight(index))
      return button
    }
    // ‹ 日付 › は中央に置く
    const stepper = el('div', 'detail-date-stepper')
    stepper.append(
      stepButton('‹', '前の夜', state.nightIndex - 1),
      el('span', 'detail-subtitle num', formatNightTitle(currentNight())),
      stepButton('›', '次の夜', state.nightIndex + 1)
    )
    dateRow.append(el('span', 'detail-date-spacer'), stepper)
    // 「今夜」に戻るボタン（今夜を表示しているときは押せない）
    const tonight = el('button', 'tonight-button', '今夜')
    tonight.type = 'button'
    tonight.setAttribute('aria-label', '今夜に戻る')
    tonight.disabled = state.nightIndex === 0
    tonight.addEventListener('click', () => goToNight(0))
    dateRow.appendChild(tonight)
    header.appendChild(dateRow)
    return header
  }

  // モデルの切り替え（表のすぐ上）。MSM・ECMWF は判定に使うモデル、GSM・AIFS は参考
  function renderModelSwitch() {
    const switcher = el('div', 'segmented detail-model-switch')
    switcher.setAttribute('role', 'group')
    switcher.setAttribute('aria-label', '表に出す雲の予報（モデル）')
    ALL_MODELS.forEach((modelKey) => {
      const button = el('button', 'segmented-button', MODEL_INFO[modelKey].label)
      if (isReferenceModel(modelKey)) {
        button.classList.add('is-reference')
        button.appendChild(el('small', 'segmented-note', '参考'))
      }
      button.type = 'button'
      button.setAttribute('aria-pressed', String(modelKey === state.selectedModel))
      button.addEventListener('click', () => {
        if (state.selectedModel === modelKey) return
        state.selectedModel = modelKey
        render()
      })
      switcher.appendChild(button)
    })
    return switcher
  }

  // 要点カード：判定（ホームの表と同じ書き方）・モデルごとの時間・暗い時間・月・日没・薄明
  function renderSummaryCard(judgment, info) {
    const card = el('section', 'card detail-summary')

    const top = el('div', 'detail-judgment-main')
    const value = el(
      'span',
      `detail-judgment-value ${STATUS_CLASSES[judgment.status]}`,
      judgmentText(judgment)
    )
    top.appendChild(value)
    if (judgment.msm || judgment.ecmwf) {
      const perModel = ['msm', 'ecmwf']
        .map((key) => {
          const r = judgment[key]
          return `${MODEL_INFO[key].label} ${r?.available ? formatHours(r.clearHours) : '範囲外'}`
        })
        .join(' ／ ')
      top.appendChild(el('span', 'detail-judgment-models num', perModel))
    }
    card.appendChild(top)

    // ⚠の説明の行は、⚠が無い夜も場所を空けておく（夜を切り替えてもカードの高さが変わらないように）
    const warning = el('p', 'detail-warning', '⚠ 周辺5kmに低層雲が多い時間あり')
    if (!judgment.lowCloudRisk) warning.classList.add('is-placeholder')
    card.appendChild(warning)

    // 暗い時間・月・日没と薄明を、いつも1行ずつ（3行）で出す
    const astro = el('div', 'detail-astro')
    const moon = el('span', 'detail-moon')
    moon.innerHTML = moonPhaseSvg(info.moonAgeDays, 18)
    astro.appendChild(moon)
    const lines = el('div', 'detail-astro-lines num')
    const darkText =
      info.darkIntervals.length > 0
        ? info.darkIntervals.map((i) => `${formatTime(i.start)}〜${formatTime(i.end)}`).join('、')
        : 'なし（月明かり）'
    const moonText = info.moonEvents
      .map((e) => `${e.type === 'rise' ? '月の出' : '月の入り'} ${formatTime(e.time)}`)
      .join('・')
    const lineTexts = [
      [`暗い時間 ${info.darkHours.toFixed(1)}h：${darkText}`, ''],
      [[moonText, `月齢 ${info.moonAgeDays.toFixed(1)}`].filter(Boolean).join(' ／ '), ''],
      [
        `日没 ${formatTime(info.sunset)}・日の出 ${formatTime(info.sunrise)} ／ ` +
          `天文薄明 ${formatTime(info.duskEnd)}〜${formatTime(info.dawnStart)}`,
        'muted',
      ],
    ]
    lineTexts.forEach(([text, className]) => {
      const line = el('div', `detail-astro-line ${className}`.trim(), text)
      line.title = text // 長くて省略されたときも、長押し等で全文を確認できるように
      lines.appendChild(line)
    })
    astro.appendChild(lines)
    card.appendChild(astro)
    return card
  }

  // 1時間ごとの表（ホームの表と同じ時刻の範囲・同じマス）
  function renderHourGrid(section, hourly, info, observer, notes = []) {
    const slots = matrixSlots(info)
    if (slots.length === 0) {
      section.appendChild(el('p', 'muted', '表を表示できる時間帯がありません'))
      return section
    }

    const grid = el('div', 'matrix')
    grid.style.gridTemplateColumns = `var(--detail-label-width) repeat(${slots.length}, 1fr)`

    // 時刻・空の状態
    grid.appendChild(el('div', 'matrix-corner'))
    slots.forEach((slot) => grid.appendChild(hourLabelCell(slot)))
    grid.appendChild(el('div', 'matrix-row-label matrix-sky-label', '空'))
    slots.forEach((slot) => grid.appendChild(skyCell(slot, info)))

    // 雲（高層・中層・低層）
    CLOUD_LAYERS.forEach(({ key, label }) => {
      grid.appendChild(el('div', 'matrix-row-label detail-row-label', label))
      slots.forEach((slot) => {
        const cloud = cloudAt(hourly, slot)
        const value = cloud?.[key]
        const cell = cloudCell({
          percent: value,
          title: value == null ? '' : `${jstParts(slot).hour}時台 ${label}の雲 ${value}%`,
        })
        cell.classList.add('detail-layer-cell')
        grid.appendChild(cell)
      })
    })

    // 風速（m/s）。注意しきい値以上は黄色
    grid.appendChild(el('div', 'matrix-row-label detail-row-label', '風'))
    slots.forEach((slot) => {
      const wind = windAt(hourly, slot)
      // 風速の数字の色：注意（黄）・警戒（赤）
      const cell = el(
        'div',
        `detail-wind-cell num text-${windLevel(wind)}`,
        wind == null ? '' : String(Math.round(wind))
      )
      grid.appendChild(cell)
    })

    // 月の高さ（グラフ）。列幅が上の表と同じなので、時間がぴったり揃う
    grid.appendChild(el('div', 'matrix-row-label detail-row-label', '月'))
    const moonCell = el('div', 'detail-moon-chart')
    moonCell.style.gridColumn = `2 / span ${slots.length}`
    const canvas = document.createElement('canvas')
    moonCell.appendChild(canvas)
    grid.appendChild(moonCell)

    section.appendChild(grid)
    section.appendChild(
      el(
        'p',
        'matrix-note detail-grid-note muted',
        `黒＝晴／白＝曇　風m/s（黄${config.windCautionThreshold}・赤${config.windDangerThreshold}〜）　月（黄＝地平線上）`
      )
    )

    notes.forEach((note) => section.appendChild(el('p', 'matrix-note detail-grid-note muted', note)))

    renderMoonChart(canvas, slots, observer)
    return section
  }

  // 月の高さだけの線グラフ。軸は出さず、上の表の列のまん中に点を合わせる
  function renderMoonChart(canvas, slots, observer) {
    const altitudes = slots.map((slot) =>
      getMoonAltitude(observer, new Date(slot.getTime() + HOUR_MS / 2))
    )
    if (chartInstance) chartInstance.destroy()
    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: slots.map((slot) => String(jstParts(slot).hour)),
        datasets: [
          {
            data: altitudes,
            borderColor: '#5b6683',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            // 地平線（0°）より上は黄色、下はグレーの線にする
            segment: {
              borderColor: (ctx) =>
                ctx.p0.parsed.y >= 0 && ctx.p1.parsed.y >= 0 ? '#f6d77a' : '#5b6683',
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: 0 },
        scales: {
          x: { offset: true, display: false },
          y: { min: -90, max: 90, display: false },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          annotation: {
            annotations: {
              horizon: {
                type: 'line',
                yMin: 0,
                yMax: 0,
                yScaleID: 'y',
                borderColor: '#2b3550',
                borderWidth: 1,
              },
            },
          },
        },
      },
    })
  }

  // 数値の情報（小さなカード）。
  //   label：見出し、value：大きく出す値（文字か部品）
  //   level：カードの段階（'ok'＝問題なし／'caution'＝注意（黄）／'danger'＝警戒（赤））。
  //          風・結露・低層雲で同じ見せ方にそろえる：枠と背景の色（文字の札は付けない：2026-11-05 オーナー指示）
  //   valueLevel：大きな値の文字の色（省略時は level と同じ）
  //   sub：補足（文字。複数行のときは [{ text, className }] の配列）
  function tile(label, value, { sub = '', level = 'ok', valueLevel = level } = {}) {
    const card = el('div', `detail-tile tile-${level}`)
    card.appendChild(el('span', 'detail-tile-label', label))
    const valueRow = el('div', `detail-tile-value num text-${valueLevel}`)
    if (value instanceof Node) valueRow.appendChild(value)
    else if (value) valueRow.appendChild(document.createTextNode(value))
    card.appendChild(valueRow)
    const subLines = Array.isArray(sub) ? sub : sub ? [{ text: sub }] : []
    subLines.forEach(({ text, className }) => {
      card.appendChild(el('span', `detail-tile-sub muted ${className ?? ''}`.trim(), text))
    })
    return card
  }

  function renderInfoTiles(hourly, ecmwfHourly, info, forecast, mainModelKey) {
    const tiles = el('section', 'detail-tiles')

    // 並び順：1段目＝風と雲（風・周辺5km低層雲・雲の流れ）、2段目＝温度と水分（最低気温・直前の雨・結露リスク）
    // 風：平均の風速は判定に使うモデル（MSM。届かない夜はECMWF）、最大瞬間風速はECMWFの9km版
    // （MSMは瞬間風速を出さないため。9km版がまだ無い古い保存データのときは、ECMWF（約25km）で代わりに出す）
    // 平均・瞬間それぞれで段階を決め、厳しい方をカードの段階にする
    const gustHourly =
      findForecastForLocation(cache, 'ecmwfWind', location.id)?.center?.hourly ?? ecmwfHourly
    const wind = nightWindInfo(hourly, gustHourly, info.sunset, info.sunrise)
    const meanLevel = windLevel(wind.maxWindSpeedMs)
    const gLevel = gustLevel(wind.maxWindGustMs)
    tiles.appendChild(
      tile(
        `風（${MODEL_INFO[mainModelKey].label}）`,
        wind.maxWindSpeedMs != null ? `${wind.maxWindSpeedMs.toFixed(1)}m/s` : '―',
        {
          level: worstLevel(meanLevel, gLevel),
          valueLevel: meanLevel,
          sub:
            wind.maxWindGustMs != null
              ? [{ text: `瞬間 ${wind.maxWindGustMs.toFixed(1)}m/s`, className: `is-oneline text-${gLevel}` }]
              : [],
        }
      )
    )

    // 周辺5kmの低層雲：暗い時間のうち、いちばん多かった時間の値（%）。方角どおりに十字に並べる
    const summary = surroundingLowCloudMax(forecast, info)
    const compass = el('div', 'detail-compass num')
    const positions = { 北: 'n', 東: 'e', 南: 's', 西: 'w' }
    summary.forEach(({ direction, maxLowCloud }) => {
      // 方角の文字＋数字（決まった幅の枠）にして、1桁でも2桁でも位置がずれないようにする
      const cell = el('span', `compass-cell compass-${positions[direction]} text-${lowCloudLevel(maxLowCloud)}`)
      cell.appendChild(el('span', 'compass-dir', direction))
      // 数字のあとに小さめの「%」を付ける（カードの幅に収めるため）
      const value = el('span', 'compass-value', maxLowCloud === null ? '―' : maxLowCloud.toFixed(0))
      if (maxLowCloud !== null) value.appendChild(el('small', 'compass-pct', '%'))
      cell.appendChild(value)
      compass.appendChild(cell)
    })
    compass.appendChild(el('span', 'compass-center', '●'))
    tiles.appendChild(
      tile('周辺5km低層雲', compass, {
        level: worstLevel(...summary.map((d) => lowCloudLevel(d.maxLowCloud))),
        valueLevel: 'ok', // 数字の色は方角ごとに付ける
        sub: '暗い時間の最大',
      })
    )

    // 雲が流れてくる方向（850hPaの風向き）。矢印は雲が進む向き
    const dirDeg = ecmwfHourly
      ? representativeWindDirection850(ecmwfHourly, info.sunset, info.sunrise)
      : null
    let dirValue = '―'
    if (dirDeg != null) {
      dirValue = el('span', 'detail-direction')
      dirValue.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate(${(dirDeg + 180) % 360}deg)">` +
        '<path d="M12 3v18M12 3l-5 6M12 3l5 6"/></svg>'
      dirValue.appendChild(document.createTextNode(`${directionLabel(dirDeg)}から`))
    }
    // （判定に使わない参考情報だが、その旨はどの表示でも同じなので書かない：2026-11-05 オーナー指示）
    tiles.appendChild(tile('雲の流れ', dirValue, { sub: '上空約1.5kmの風' }))

    const minTemp = minNightTemperature(hourly, info.sunset, info.sunrise)
    tiles.appendChild(
      tile('最低気温', minTemp === null ? '―' : `${minTemp.toFixed(1)}℃`, { sub: '夜間' })
    )

    // 直前の雨：暗くなる前にどれだけ降って、いつ止んだか（地面の湿り・霧や靄の出やすさの目安）
    const rain = recentRain(hourly, info)
    const rainLv = rainLevel(rain)
    let rainSub = []
    if (rain) {
      let timing
      if (rain.rainingAtDark) timing = '暗くなる時も雨'
      else if (rain.hoursSinceRain === null) timing = `${config.rainLookbackHours}時間降雨なし`
      else if (rain.hoursSinceRain < 1) timing = '止んだばかり'
      else timing = `止んで${Math.floor(rain.hoursSinceRain)}時間`
      rainSub = [{ text: timing, className: 'is-oneline' }]
      if (rain.nightMm >= 0.1) {
        // 警戒の量（rainNightMinMm）に届いたときだけ赤くする
        const nightLv = rain.nightMm >= config.rainNightMinMm ? 'danger' : 'ok'
        rainSub.push({ text: `夜間も${rain.nightMm.toFixed(1)}mm`, className: `is-oneline text-${nightLv}` })
      }
    }
    tiles.appendChild(
      tile(
        '直前の雨',
        !rain ? '―' : rain.totalMm >= 0.1 ? `${rain.totalMm.toFixed(1)}mm` : 'なし',
        { level: rainLv, sub: rainSub }
      )
    )

    // 結露：気温と露点の差（いちばん小さい時間）を大きく出す。差が小さいほど結露しやすい
    const dew = dewPointRisk(hourly, info.sunset, info.sunrise)
    tiles.appendChild(
      tile('結露リスク', dew ? `${dew.minDiff.toFixed(1)}℃` : '―', {
        level: dewLevel(dew?.minDiff),
        sub: '気温と露点の差',
      })
    )

    return tiles
  }

  function render() {
    container.innerHTML = ''
    const header = el('div')
    container.appendChild(header)

    const night = currentNight()
    const observer = createObserver(location.lat, location.lng, location.elevation ?? 0)
    const info = computeNightInfo(observer, night)
    const { judgment } = computeNightJudgment(location, night, cache)
    // 判定に使うモデルのうち、この夜に予報が届いている方（MSMが届いていればMSM、なければECMWF）
    const msm = findForecastForLocation(cache, 'msm', location.id)
    const msmCovers =
      msm && judgeModelForNight(msm.center.hourly, info.dawnStart, info.darkIntervals).available
    const autoMainModel = msmCovers ? 'msm' : 'ecmwf'
    if (!state.selectedModel) state.selectedModel = autoMainModel
    const selected = state.selectedModel
    // 下のカード（気温・結露・降水量・周辺5km）は、参考モデルでは取っていないデータなので、
    // 参考モデルを選んでいるときも判定に使うモデルの予報で出す
    const mainModel = isReferenceModel(selected) ? autoMainModel : selected

    header.replaceWith(renderHeader())
    container.appendChild(renderSummaryCard(judgment, info))

    // 1時間ごとの表（選んだモデルの雲と風）
    const gridSection = el('section', 'matrix-section detail-grid')
    gridSection.appendChild(renderModelSwitch())
    const selectedForecast = findForecastForLocation(cache, selected, location.id)
    const selectedResult = selectedForecast
      ? judgeModelForNight(selectedForecast.center.hourly, info.dawnStart, info.darkIntervals)
      : { available: false }
    const label = MODEL_INFO[selected].label
    if (!selectedForecast || !selectedResult.available) {
      gridSection.classList.add('is-empty') // 表が無いときも、表があるときと同じ高さにする
      gridSection.appendChild(
        el(
          'p',
          'error-message detail-grid-message',
          !selectedForecast && isReferenceModel(selected)
            ? `${label}の予報がまだありません（更新ボタンで予報を取り直すと取得します）`
            : `${label}のこの夜のデータがありません（予報範囲外の可能性があります）`
        )
      )
    } else {
      // 参考モデルの説明の行。判定に使うモデルのときも場所は空けておく（モデルを切り替えても高さが変わらないように）
      const notes = [
        isReferenceModel(selected)
          ? `${label}（参考）${formatHours(selectedResult.clearHours)}・判定に不使用／` +
            `下のカードは${MODEL_INFO[mainModel].label}`
          : '\u00a0', // 潰れない空白（ふつうの空白だと行の高さが0になってしまう）
      ]
      renderHourGrid(gridSection, selectedForecast.center.hourly, info, observer, notes)
    }
    container.appendChild(gridSection)

    // 数値の情報（判定に使うモデルの予報）
    const mainForecast = findForecastForLocation(cache, mainModel, location.id)
    const mainAvailable =
      mainForecast &&
      judgeModelForNight(mainForecast.center.hourly, info.dawnStart, info.darkIntervals).available
    if (mainAvailable) {
      const ecmwfForecast = findForecastForLocation(cache, 'ecmwf', location.id)
      container.appendChild(
        renderInfoTiles(
          mainForecast.center.hourly,
          ecmwfForecast?.center?.hourly,
          info,
          mainForecast,
          mainModel
        )
      )
    }
  }

  render()
}
