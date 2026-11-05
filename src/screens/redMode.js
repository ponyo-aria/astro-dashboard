// 赤色モード：撮影地で暗さに慣れた目を守るため、画面全体を赤一色（緑・青の光を出さない）にする。
//
// しくみ：画面を白黒にしてから、真っ赤な透明シートを「掛け算」で重ねる。
// 白黒の明るさがそのまま赤の明るさになり、緑・青の成分は必ず0になる。
// グラフや画像も含めて全部が赤になるので、画面ごとに色を指定し直す必要がない。

const STORAGE_KEY = 'astro-dashboard.redMode.v1'
const THEME_COLOR_NORMAL = '#0b1026'
const THEME_COLOR_RED = '#000000'

export function isRedMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setRedMode(on) {
  document.body.classList.toggle('red-mode', on)
  // スマホ上部のバーの色も合わせる
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', on ? THEME_COLOR_RED : THEME_COLOR_NORMAL)
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // 保存できなくても、今開いている間は赤色モードになる
  }
  // 設定画面のスイッチの表示もそろえる
  document.querySelectorAll('.red-mode-switch').forEach((button) => {
    button.setAttribute('aria-checked', String(on))
    const state = button.querySelector('.switch-state')
    if (state) state.textContent = on ? 'オン' : 'オフ'
  })
}

/** アプリ起動時に1回呼ぶ。赤いシートを用意し、前回の設定を復元する。 */
export function initRedMode() {
  if (!document.querySelector('.red-overlay')) {
    const overlay = document.createElement('div')
    overlay.className = 'red-overlay'
    overlay.setAttribute('aria-hidden', 'true')
    document.body.appendChild(overlay)
  }
  setRedMode(isRedMode())
}

/**
 * 赤色モードのオン・オフを切り替えるスイッチを作る（設定画面に置く）。
 * 天気予報は出発前に見ることが多いので、ホーム画面には置かない（2026-11-05 オーナー指示）
 */
export function createRedModeSwitch() {
  // スライド式のスイッチ。オフ＝灰色で丸が左、オン＝赤で丸が右。左に今の状態を文字でも出す
  const on = isRedMode()
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'red-mode-switch'
  button.setAttribute('role', 'switch')
  button.setAttribute('aria-label', '赤色モード')
  button.setAttribute('aria-checked', String(on))
  button.innerHTML =
    `<span class="switch-state">${on ? 'オン' : 'オフ'}</span>` +
    '<span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span>'
  button.addEventListener('click', () => setRedMode(!document.body.classList.contains('red-mode')))
  return button
}
