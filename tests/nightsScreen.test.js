import { describe, it, expect, beforeEach } from 'vitest'
import { renderNightsScreen } from '../src/screens/nightsScreen.js'

const locations = [
  { id: '1', name: 'テスト地点A', lat: 35.4, lng: 138.6, elevation: 900 },
  { id: '2', name: '八ヶ岳ふれあい公園', lat: 36.0, lng: 138.5, elevation: 1300 },
  { id: '3', name: 'テスト地点C', lat: 34.9, lng: 139.0, elevation: 700 },
]

beforeEach(() => {
  localStorage.clear()
})

describe('今後7夜の暗い時間一覧画面', () => {
  it('初期状態では八ヶ岳ふれあい公園（野辺山）だけが選ばれ、7夜分のカードが出る', () => {
    const container = document.createElement('div')
    renderNightsScreen(container, locations)

    const sections = container.querySelectorAll('.nights-section')
    expect(sections).toHaveLength(1)
    expect(container.querySelectorAll('.nights-row')).toHaveLength(7)

    const select = container.querySelector('select')
    expect(select.value).toBe('2')
  })

  it('地点を選び直すと、その地点の7夜分に切り替わる', () => {
    const container = document.createElement('div')
    renderNightsScreen(container, locations)

    const select = container.querySelector('select')
    select.value = '1'
    select.dispatchEvent(new Event('change'))

    const newSelect = container.querySelector('select')
    expect(newSelect.value).toBe('1')
    expect(container.querySelectorAll('.nights-section')).toHaveLength(1)
  })

  it('地点が1つもないときは案内文が出る', () => {
    const container = document.createElement('div')
    renderNightsScreen(container, [])
    expect(container.textContent).toContain('登録されていません')
  })
})
