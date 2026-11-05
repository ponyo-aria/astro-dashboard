import { describe, it, expect, beforeEach } from 'vitest'
import {
  matrixSlots,
  skyStateOf,
  toForecastTimeKey,
  cloudAt,
  windAt,
  pickMatrixForecast,
  bestStatus,
} from '../src/logic/nightMatrix.js'
import { moonPhaseShape, moonPhaseSvg } from '../src/screens/moonPhaseIcon.js'
import { setRedMode, isRedMode, initRedMode } from '../src/screens/redMode.js'

const jst = (s) => new Date(`${s}+09:00`)

// 冬の夜の例：薄明終了 18:14、薄明開始 04:45、暗い時間は 18:14〜23:00（その後は月が出る）
const info = {
  sunset: jst('2026-11-08T16:40:00'),
  sunrise: jst('2026-11-09T06:15:00'),
  duskEnd: jst('2026-11-08T18:14:00'),
  dawnStart: jst('2026-11-09T04:45:00'),
  darkIntervals: [{ start: jst('2026-11-08T18:14:00'), end: jst('2026-11-08T23:00:00') }],
}

describe('表に並べる時刻', () => {
  it('薄明終了の1時間前〜薄明開始の1時間後を、1時間ごとに並べる（17時〜翌5時の13列）', () => {
    const slots = matrixSlots(info, 1)
    expect(slots).toHaveLength(13)
    expect(toForecastTimeKey(slots[0])).toBe('2026-11-08T17:00')
    expect(toForecastTimeKey(slots[12])).toBe('2026-11-09T05:00')
  })

  it('前後に足す時間を0にすると、薄明の範囲だけになる', () => {
    const slots = matrixSlots(info, 0)
    expect(toForecastTimeKey(slots[0])).toBe('2026-11-08T18:00')
    expect(toForecastTimeKey(slots.at(-1))).toBe('2026-11-09T04:00')
  })

  it('薄明の時刻が無いときは空の一覧（画面は崩さない）', () => {
    expect(matrixSlots({ ...info, duskEnd: null, sunset: null })).toEqual([])
  })
})

describe('空の状態', () => {
  it('1時間のまん中の時刻で、暗い／月あり／薄明を判断する', () => {
    expect(skyStateOf(jst('2026-11-08T17:00:00'), info)).toBe('twilight') // 17:30 は薄明
    expect(skyStateOf(jst('2026-11-08T18:00:00'), info)).toBe('dark') // 18:30 は暗い
    expect(skyStateOf(jst('2026-11-09T01:00:00'), info)).toBe('moon') // 1:30 は月あり
    expect(skyStateOf(jst('2026-11-09T04:00:00'), info)).toBe('moon') // 4:30 は薄明開始（4:45）前なので月あり
    expect(skyStateOf(jst('2026-11-09T05:00:00'), info)).toBe('twilight') // 5:30 は薄明
  })
})

describe('雲のマス', () => {
  const hourly = {
    time: ['2026-11-08T18:00', '2026-11-08T19:00', '2026-11-08T20:00'],
    cloud_cover_low: [5, 0, null],
    cloud_cover_mid: [0, 0, 0],
    cloud_cover_high: [3, 10, 0],
  }

  it('3層のうち一番多い雲量と、晴れ（全層5%以下）かどうかを返す', () => {
    expect(cloudAt(hourly, jst('2026-11-08T18:00:00'))).toMatchObject({ max: 5, isClear: true })
    // 高層の薄雲が10%あるので晴れではない
    expect(cloudAt(hourly, jst('2026-11-08T19:00:00'))).toMatchObject({ max: 10, isClear: false })
  })

  it('風速は km/h で届くので m/s に直して返す（データが無ければ null）', () => {
    const windy = { ...hourly, wind_speed_10m: [18, null, 7.2] }
    expect(windAt(windy, jst('2026-11-08T18:00:00'))).toBeCloseTo(5, 5)
    expect(windAt(windy, jst('2026-11-08T19:00:00'))).toBeNull()
    expect(windAt(hourly, jst('2026-11-08T18:00:00'))).toBeNull()
  })

  it('データが欠けている・範囲外の時刻は null', () => {
    expect(cloudAt(hourly, jst('2026-11-08T20:00:00'))).toBeNull()
    expect(cloudAt(hourly, jst('2026-11-08T21:00:00'))).toBeNull()
    expect(cloudAt(undefined, jst('2026-11-08T18:00:00'))).toBeNull()
  })

  it('夜の終わりまでMSMが届いていればMSM、届いていなければECMWFの予報を使う', () => {
    const covering = { time: ['2026-11-09T06:00'] }
    const short = { time: ['2026-11-09T01:00'] }
    const cache = (msmHourly) => ({
      results: {
        msm: [{ locationId: 'a', center: { hourly: msmHourly } }],
        ecmwf: [{ locationId: 'a', center: { hourly: covering } }],
      },
    })
    expect(pickMatrixForecast(cache(covering), 'a', info).model).toBe('msm')
    expect(pickMatrixForecast(cache(short), 'a', info).model).toBe('ecmwf')
    expect(pickMatrixForecast(null, 'a', info)).toBeNull()
  })
})

describe('その夜いちばん良い判定', () => {
  it('◎ > △ > 参考：可 > × の順で良いものを選ぶ', () => {
    expect(bestStatus(['no_go', 'split', 'go'])).toBe('go')
    expect(bestStatus(['no_go', 'reference_go'])).toBe('reference_go')
    expect(bestStatus(['no_dark_time', 'no_go'])).toBe('no_go')
    expect(bestStatus([])).toBe('no_data')
  })
})

describe('月の形の絵', () => {
  it('新月は光っていない、満月は全部光っている、上弦は半分', () => {
    expect(moonPhaseShape(0).litFraction).toBeCloseTo(0, 2)
    expect(moonPhaseShape(14.77).litFraction).toBeCloseTo(1, 2)
    expect(moonPhaseShape(7.38).litFraction).toBeCloseTo(0.5, 1)
    expect(moonPhaseShape(7.38).waxing).toBe(true)
    expect(moonPhaseShape(22).waxing).toBe(false)
  })

  it('月齢に応じたSVGを返す（新月は光る部分なし）', () => {
    expect(moonPhaseSvg(0)).not.toContain('moon-icon-lit')
    expect(moonPhaseSvg(7)).toContain('<path')
    expect(moonPhaseSvg(14.8)).toContain('moon-icon-lit')
  })
})

describe('赤色モード', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.className = ''
  })

  it('切り替えると画面に赤色モードの印が付き、次に開いたときも覚えている', () => {
    initRedMode()
    expect(document.querySelector('.red-overlay')).not.toBeNull()
    expect(document.body.classList.contains('red-mode')).toBe(false)

    setRedMode(true)
    expect(document.body.classList.contains('red-mode')).toBe(true)
    expect(isRedMode()).toBe(true)

    // 開き直し相当
    document.body.className = ''
    initRedMode()
    expect(document.body.classList.contains('red-mode')).toBe(true)
    // 赤いシートは1枚だけ
    expect(document.querySelectorAll('.red-overlay')).toHaveLength(1)
  })
})
