import { describe, it, expect, vi } from 'vitest'
import { renderDetailScreen } from '../src/screens/detailScreen.js'

const location = { id: 'a', name: 'テスト地点', lat: 35.4, lng: 138.6, elevation: 900 }

function makeHourly(startHourJst, hoursCount, overrides = {}) {
  const time = []
  const cloud_cover_low = []
  const cloud_cover_mid = []
  const cloud_cover_high = []
  const precipitation = []
  const temperature_2m = []
  const dew_point_2m = []
  const wind_speed_10m = []
  const wind_gusts_10m = []
  const wind_speed_850hPa = []
  const wind_direction_850hPa = []

  for (let i = 0; i < hoursCount; i += 1) {
    const hour = (startHourJst + i) % 24
    const day = 4 + Math.floor((startHourJst + i) / 24)
    time.push(`2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`)
    cloud_cover_low.push(0)
    cloud_cover_mid.push(0)
    cloud_cover_high.push(0)
    precipitation.push(0)
    temperature_2m.push(5)
    dew_point_2m.push(2)
    wind_speed_10m.push(7.2)
    wind_gusts_10m.push(10.8)
    wind_speed_850hPa.push(10)
    wind_direction_850hPa.push(270)
  }

  return {
    time,
    cloud_cover_low,
    cloud_cover_mid,
    cloud_cover_high,
    precipitation,
    temperature_2m,
    dew_point_2m,
    wind_speed_10m,
    wind_gusts_10m,
    wind_speed_850hPa,
    wind_direction_850hPa,
    ...overrides,
  }
}

function makePointGroup(locationId) {
  const hourly = makeHourly(0, 48)
  return {
    locationId,
    center: { hourly },
    north: { hourly },
    east: { hourly },
    south: { hourly },
    west: { hourly },
  }
}

function makeCache() {
  return {
    fetchedAt: Date.now(),
    results: {
      msm: [makePointGroup('a')],
      ecmwf: [makePointGroup('a')],
    },
    modelMeta: {},
  }
}

describe('地点詳細画面', () => {
  it('データがあれば、グラフ（canvas）と数値情報、戻るボタンが表示される', () => {
    const container = document.createElement('div')
    const nightDate = new Date('2026-11-04T03:00:00Z') // 2026-11-04 12:00 JST

    renderDetailScreen(container, {
      location,
      nightDate,
      cache: makeCache(),
      onBack: () => {},
    })

    expect(container.querySelector('canvas')).toBeTruthy()
    // 1時間ごとの表：ホームと同じ部品（空の帯・雲のマス）で、高層・中層・低層の3行が並ぶ
    expect(container.querySelector('.detail-grid')).toBeTruthy()
    const skyCount = container.querySelectorAll('.detail-grid .matrix-sky').length
    expect(skyCount).toBeGreaterThan(0)
    expect(container.querySelectorAll('.detail-layer-cell')).toHaveLength(skyCount * 3)
    // 風速の行（テストデータは 7.2km/h ＝ 2m/s）
    expect(container.querySelectorAll('.detail-wind-cell')).toHaveLength(skyCount)
    expect(container.querySelector('.detail-wind-cell').textContent).toBe('2')
    // 判定カード（快晴データなので◎）とモデルごとの時間
    expect(container.querySelector('.detail-judgment-value').textContent).toContain('◎')
    expect(container.textContent).toContain('MSM')
    // 暗い時間・日没・天文薄明も表示される
    expect(container.textContent).toContain('暗い時間')
    expect(container.textContent).toContain('日没')
    expect(container.textContent).toContain('天文薄明')
    // 数値の情報
    expect(container.textContent).toContain('降水量')
    expect(container.textContent).toContain('結露リスク')
    // 結露：テストデータは気温5℃・露点2℃（差3℃）なので「注意」（黄色の枠と札）
    const dewTile = [...container.querySelectorAll('.detail-tile')].find((t) => t.textContent.includes('結露'))
    expect(dewTile.classList.contains('tile-caution')).toBe(true)
    expect(dewTile.querySelector('.tile-level-badge')).toBeNull() // 文字の札は付けない（色だけ）
    expect(dewTile.querySelector('.detail-tile-value').textContent).toBe('3.0℃')
    // 平均の風はMSM。「参考値」「判定には不使用」の文言は出さない（2026-11-05 オーナー指示）
    expect(container.textContent).toContain('風（MSM）')
    expect(container.textContent).not.toContain('参考値')
    expect(container.textContent).not.toContain('判定には不使用')
    expect(container.textContent).toContain('上空約1.5kmの風')
    expect(container.textContent).toContain('周辺5km')
    expect(container.querySelector('button').textContent).toContain('戻る')
  })

  it('戻るボタンを押すとonBackが呼ばれる', () => {
    const container = document.createElement('div')
    const onBack = vi.fn()
    const nightDate = new Date('2026-11-04T03:00:00Z')

    renderDetailScreen(container, { location, nightDate, cache: makeCache(), onBack })

    container.querySelector('button').click()
    expect(onBack).toHaveBeenCalled()
  })

  it('データが無いモデルを選ぶと、エラーメッセージが出て画面が崩れない', () => {
    const container = document.createElement('div')
    const nightDate = new Date('2026-11-04T03:00:00Z')

    renderDetailScreen(container, { location, nightDate, cache: null, onBack: () => {} })

    expect(container.textContent).toContain('データがありません')
    expect(container.innerHTML.trim()).not.toBe('')
  })

  it('モデル切り替えボタンがあり、押すと再描画される', () => {
    const container = document.createElement('div')
    const nightDate = new Date('2026-11-04T03:00:00Z')

    renderDetailScreen(container, { location, nightDate, cache: makeCache(), onBack: () => {} })

    const buttons = [...container.querySelectorAll('button')]
    const ecmwfButton = buttons.find((b) => b.textContent === 'ECMWF')
    expect(ecmwfButton).toBeTruthy()
    ecmwfButton.click()

    // 押したボタンが選択中の表示になる
    const pressed = [...container.querySelectorAll('.segmented-button')].find(
      (b) => b.getAttribute('aria-pressed') === 'true'
    )
    expect(pressed.textContent).toBe('ECMWF')

    // 再描画後も壊れず表示され続ける
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('日付の左右のボタンで、前の夜・次の夜に移れる（端の夜ではボタンが押せない）', () => {
    const container = document.createElement('div')
    const nights = [0, 1, 2].map((i) => new Date(Date.parse('2026-11-04T03:00:00Z') + i * 864e5))
    const onNightChange = vi.fn()

    renderDetailScreen(container, {
      location,
      nightDate: nights[0],
      nightDates: nights,
      cache: makeCache(),
      onBack: () => {},
      onNightChange,
    })

    const prev = () => container.querySelector('[aria-label="前の夜"]')
    const next = () => container.querySelector('[aria-label="次の夜"]')
    expect(container.querySelector('.detail-subtitle').textContent).toBe('11/4(水)の夜')
    expect(prev().disabled).toBe(true)

    next().click()
    expect(container.querySelector('.detail-subtitle').textContent).toBe('11/5(木)の夜')
    expect(onNightChange).toHaveBeenLastCalledWith(1, nights[1])
    expect(prev().disabled).toBe(false)

    next().click()
    expect(next().disabled).toBe(true)
    // テストデータは11/5いっぱいまでなので、11/6の夜はデータが無い旨が出る（画面は崩れない）
    expect(container.textContent).toContain('データがありません')

    prev().click()
    expect(container.querySelector('.detail-subtitle').textContent).toBe('11/5(木)の夜')
  })

  it('「今夜」ボタンで今夜に戻れる（今夜を表示しているときは押せない）', () => {
    const container = document.createElement('div')
    const nights = [0, 1, 2].map((i) => new Date(Date.parse('2026-11-04T03:00:00Z') + i * 864e5))
    const onNightChange = vi.fn()
    renderDetailScreen(container, {
      location,
      nightDate: nights[2],
      nightDates: nights,
      cache: makeCache(),
      onBack: () => {},
      onNightChange,
    })

    const tonight = () => container.querySelector('[aria-label="今夜に戻る"]')
    expect(tonight().disabled).toBe(false)
    tonight().click()
    expect(container.querySelector('.detail-subtitle').textContent).toBe('11/4(水)の夜')
    expect(onNightChange).toHaveBeenLastCalledWith(0, nights[0])
    expect(tonight().disabled).toBe(true)
  })

  it('夜を切り替えてもカードの形が変わらない（⚠の行はいつもあり、数値のカードは決まった順に6枚）', () => {
    const container = document.createElement('div')
    renderDetailScreen(container, {
      location,
      nightDate: new Date('2026-11-04T03:00:00Z'),
      cache: makeCache(),
      onBack: () => {},
    })
    // テストデータでは⚠は無いが、行の場所は空けてある
    const warning = container.querySelector('.detail-warning')
    expect(warning).toBeTruthy()
    expect(warning.classList.contains('is-placeholder')).toBe(true)
    // 暗い時間・月・日没の3行
    expect(container.querySelectorAll('.detail-astro-line')).toHaveLength(3)
    // 数値のカードの並び
    const labels = [...container.querySelectorAll('.detail-tile-label')].map((e) => e.textContent)
    expect(labels).toEqual(['最低気温', '風（MSM）', '結露リスク', '周辺5km低層雲', '雲の流れ', '降水量'])
  })

  it('最初に表示するモデルを指定して開ける（比較画面でECMWFのマスを押したとき）', () => {
    const container = document.createElement('div')
    renderDetailScreen(container, {
      location,
      nightDate: new Date('2026-11-04T03:00:00Z'),
      initialModel: 'ecmwf',
      cache: makeCache(),
      onBack: () => {},
    })
    const pressed = [...container.querySelectorAll('.segmented-button')].find(
      (b) => b.getAttribute('aria-pressed') === 'true'
    )
    expect(pressed.textContent).toBe('ECMWF')
  })

  it('参考モデル（GSM・AIFS）に切り替えると表の雲がそのモデルになり、下のカードは判定に使うモデルのまま', () => {
    const cache = makeCache()
    // AIFSだけ一晩中曇り（表の低層雲のマスが白くなるはず）
    const cloudy = makeHourly(0, 48, { cloud_cover_low: Array(48).fill(100) })
    cache.results.aifs = [{ locationId: 'a', center: { hourly: cloudy } }]
    const container = document.createElement('div')
    renderDetailScreen(container, {
      location,
      nightDate: new Date('2026-11-04T03:00:00Z'),
      cache,
      onBack: () => {},
    })

    const buttons = [...container.querySelectorAll('.detail-model-switch .segmented-button')]
    expect(buttons.map((b) => b.firstChild.textContent)).toEqual(['MSM', 'ECMWF', 'GSM', 'AIFS'])
    buttons[3].click()

    const pressed = container.querySelector('.detail-model-switch [aria-pressed="true"]')
    expect(pressed.firstChild.textContent).toBe('AIFS')
    // 低層の行のマスは白（曇り）
    const lowCells = [...container.querySelectorAll('.detail-layer-cell')].slice(-container.querySelectorAll('.detail-grid .matrix-sky').length)
    expect(lowCells.every((c) => c.style.backgroundColor === 'rgb(255, 255, 255)')).toBe(true)
    expect(container.textContent).toContain('AIFS（参考）0h・判定に不使用／下のカードはMSM')
    // 判定（要点カード）は MSM・ECMWF のまま◎、下のカードも出ている
    expect(container.querySelector('.detail-judgment-value').textContent).toContain('◎')
    expect(container.querySelectorAll('.detail-tile')).toHaveLength(6)
  })

  it('参考モデルの予報がまだ無いとき（古い保存データ）は、その旨を出して画面は崩れない', () => {
    const container = document.createElement('div')
    renderDetailScreen(container, {
      location,
      nightDate: new Date('2026-11-04T03:00:00Z'),
      initialModel: 'gsm',
      cache: makeCache(),
      onBack: () => {},
    })
    expect(container.textContent).toContain('GSMの予報がまだありません')
    expect(container.querySelectorAll('.detail-tile')).toHaveLength(6)
  })

  it('上の地点名から、同じ夜のまま別の地点に切り替えられる', () => {
    const other = { id: 'b', name: '別の地点', lat: 36.0, lng: 138.5, elevation: 1300 }
    const cache = makeCache()
    // 別の地点はMSM・ECMWFとも一晩中曇り
    const cloudy = makeHourly(0, 48, { cloud_cover_low: Array(48).fill(100) })
    const cloudyGroup = { locationId: 'b', center: { hourly: cloudy }, north: { hourly: cloudy }, east: { hourly: cloudy }, south: { hourly: cloudy }, west: { hourly: cloudy } }
    cache.results.msm.push(cloudyGroup)
    cache.results.ecmwf.push(cloudyGroup)
    const onLocationChange = vi.fn()
    const container = document.createElement('div')
    renderDetailScreen(container, {
      location,
      locations: [location, other],
      nightDate: new Date('2026-11-04T03:00:00Z'),
      cache,
      onBack: () => {},
      onLocationChange,
    })

    const select = () => container.querySelector('.detail-location-select')
    expect([...select().options].map((o) => o.textContent)).toEqual(['テスト地点', '別の地点'])
    expect(container.querySelector('.detail-judgment-value').textContent).toContain('◎')

    select().value = 'b'
    select().dispatchEvent(new Event('change'))

    expect(onLocationChange).toHaveBeenCalledWith(other)
    expect(select().value).toBe('b')
    // 同じ夜のまま、別の地点の判定（一晩中曇り→×）に変わる
    expect(container.querySelector('.detail-subtitle').textContent).toBe('11/4(水)の夜')
    expect(container.querySelector('.detail-judgment-value').textContent).toContain('×')
  })

  it('⚠の説明には「判定は変えない」を書かない', () => {
    const container = document.createElement('div')
    renderDetailScreen(container, {
      location,
      nightDate: new Date('2026-11-04T03:00:00Z'),
      cache: makeCache(),
      onBack: () => {},
    })
    expect(container.querySelector('.detail-warning').textContent).toBe('⚠ 周辺5kmに低層雲が多い時間あり')
  })

  it('風のカード：平均はMSM、瞬間風速はECMWF 9km版の値を使い、瞬間10m/s以上で注意', () => {
    const cache = makeCache() // テストデータの平均は 7.2km/h ＝ 2m/s
    const gusty = makeHourly(0, 48, { wind_gusts_10m: Array(48).fill(43.2) }) // 12m/s
    cache.results.ecmwfWind = [{ locationId: 'a', center: { hourly: gusty } }]
    const container = document.createElement('div')
    renderDetailScreen(container, {
      location,
      nightDate: new Date('2026-11-04T03:00:00Z'),
      cache,
      onBack: () => {},
    })
    const windTile = [...container.querySelectorAll('.detail-tile')].find((t) => t.textContent.startsWith('風'))
    expect(windTile.querySelector('.detail-tile-value').textContent).toBe('2.0m/s')
    // 瞬間12m/s＝注意（黄）。カードは黄色の枠、瞬間の数字も黄色
    expect(windTile.classList.contains('tile-caution')).toBe(true)
    expect(windTile.querySelector('.detail-tile-sub.text-caution').textContent).toBe('瞬間 12.0m/s')
    // 平均は2m/sなので、平均の数字は白のまま
    expect(windTile.querySelector('.detail-tile-value').classList.contains('text-ok')).toBe(true)
  })

  it('平均の風速が5m/s以上なら、平均の数字も黄色にする', () => {
    const cache = makeCache()
    const windy = makeHourly(0, 48, { wind_speed_10m: Array(48).fill(21.6) }) // 6m/s
    const group = { locationId: 'a', center: { hourly: windy }, north: { hourly: windy }, east: { hourly: windy }, south: { hourly: windy }, west: { hourly: windy } }
    cache.results.msm = [group]
    const container = document.createElement('div')
    renderDetailScreen(container, { location, nightDate: new Date('2026-11-04T03:00:00Z'), cache, onBack: () => {} })
    const windTile = [...container.querySelectorAll('.detail-tile')].find((t) => t.textContent.startsWith('風'))
    const value = windTile.querySelector('.detail-tile-value')
    expect(value.textContent).toBe('6.0m/s')
    expect(value.classList.contains('text-caution')).toBe(true)
    expect(windTile.classList.contains('tile-caution')).toBe(true)
  })

  it('平均8m/s以上・瞬間15m/s以上なら「警戒」（赤の枠）', () => {
    const cache = makeCache()
    const stormy = makeHourly(0, 48, { wind_speed_10m: Array(48).fill(32.4) }) // 9m/s
    const group = { locationId: 'a', center: { hourly: stormy }, north: { hourly: stormy }, east: { hourly: stormy }, south: { hourly: stormy }, west: { hourly: stormy } }
    cache.results.msm = [group]
    const container = document.createElement('div')
    renderDetailScreen(container, { location, nightDate: new Date('2026-11-04T03:00:00Z'), cache, onBack: () => {} })
    const windTile = [...container.querySelectorAll('.detail-tile')].find((t) => t.textContent.startsWith('風'))
    expect(windTile.classList.contains('tile-danger')).toBe(true)
    expect(windTile.querySelector('.detail-tile-value').classList.contains('text-danger')).toBe(true)
  })

  it('周辺5kmの低層雲：暗い時間の最大値を%付きで決まった幅の枠に出し、5%超は注意・30%超は警戒', () => {
    const cache = makeCache()
    const container = document.createElement('div')
    renderDetailScreen(container, { location, nightDate: new Date('2026-11-04T03:00:00Z'), cache, onBack: () => {} })
    const values = [...container.querySelectorAll('.detail-compass .compass-value')].map((e) => e.textContent)
    expect(values).toEqual(['0%', '0%', '0%', '0%']) // テストデータは低層雲0%（%は小さめの文字）
    expect(container.querySelectorAll('.detail-compass .compass-pct')).toHaveLength(4)
    expect(container.textContent).toContain('暗い時間の最大')
    const cloudTile = [...container.querySelectorAll('.detail-tile')].find((t) => t.textContent.includes('周辺'))
    expect(cloudTile.classList.contains('tile-ok')).toBe(true) // 0%なので問題なし

    // 北だけ一晩中40%（警戒）、東は10%（注意）
    const cache2 = makeCache()
    const g = cache2.results.msm[0]
    g.north = { hourly: makeHourly(0, 48, { cloud_cover_low: Array(48).fill(40) }) }
    g.east = { hourly: makeHourly(0, 48, { cloud_cover_low: Array(48).fill(10) }) }
    const c2 = document.createElement('div')
    renderDetailScreen(c2, { location, nightDate: new Date('2026-11-04T03:00:00Z'), cache: cache2, onBack: () => {} })
    const tile2 = [...c2.querySelectorAll('.detail-tile')].find((t) => t.textContent.includes('周辺'))
    expect(tile2.classList.contains('tile-danger')).toBe(true)
    expect(tile2.querySelector('.compass-n').classList.contains('text-danger')).toBe(true)
    expect(tile2.querySelector('.compass-e').classList.contains('text-caution')).toBe(true)
    expect(tile2.querySelector('.compass-s').classList.contains('text-ok')).toBe(true)
  })
})
