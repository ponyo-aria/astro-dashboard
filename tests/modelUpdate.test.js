import { describe, it, expect } from 'vitest'
import { nextModelUpdate } from '../src/logic/modelUpdate.js'

const jst = (s) => new Date(`${s}+09:00`)
// 12:00の予報が15:30に公開された。MSMは3時間ごとに更新
const meta = { initTime: jst('2026-11-05T12:00:00'), availableTime: jst('2026-11-05T15:30:00'), updateIntervalSeconds: 10800 }

describe('次の予報が出る時刻の目安', () => {
  it('「公開された時刻＋更新の間隔」を次回とする（元になった時刻＋間隔＝15:00 ではない）', () => {
    const r = nextModelUpdate(meta, jst('2026-11-05T16:00:00'))
    expect(r.nextAvailable).toEqual(jst('2026-11-05T18:30:00'))
    expect(r.isNewerAvailable).toBe(false)
  })

  it('次回の時刻を過ぎていれば「新しい予報あり」', () => {
    expect(nextModelUpdate(meta, jst('2026-11-05T18:30:00')).isNewerAvailable).toBe(true)
  })

  it('保存済みの情報（時刻が文字になっている）でも計算できる', () => {
    const saved = JSON.parse(JSON.stringify(meta))
    expect(nextModelUpdate(saved, jst('2026-11-05T16:00:00')).nextAvailable).toEqual(jst('2026-11-05T18:30:00'))
  })

  it('情報が無い・壊れているときは null（画面は崩さない）', () => {
    expect(nextModelUpdate(undefined)).toBeNull()
    expect(nextModelUpdate({ availableTime: 'こわれた値', updateIntervalSeconds: 10800 })).toBeNull()
  })

  it('目安の時刻を過ぎてから取りに行ってもまだ同じ予報なら「公開待ち（遅れ）」で、「新しい予報あり」と言わない', () => {
    // 18:30が目安。18:40に取りに行ったがまだ15:30公開の予報のまま
    const r = nextModelUpdate(meta, jst('2026-11-05T18:45:00'), jst('2026-11-05T18:40:00'))
    expect(r.status).toBe('delayed')
    expect(r.isNewerAvailable).toBe(false)
  })

  it('目安の時刻より前に取ったデータなら、時刻を過ぎたら「新しい予報あり」', () => {
    const r = nextModelUpdate(meta, jst('2026-11-05T18:45:00'), jst('2026-11-05T17:00:00'))
    expect(r.status).toBe('newer')
  })

  it('公開待ちのまま30分たったら、もう一度「新しい予報あり」にする（そろそろ出ているはず）', () => {
    const r = nextModelUpdate(meta, jst('2026-11-05T19:15:00'), jst('2026-11-05T18:40:00'))
    expect(r.status).toBe('newer')
  })
})
