// 予報を取得している間の表示（ホーム画面・比較画面で共通）。
//   ・「取得中… 12秒」のように、待っている秒数を1秒ずつ数えて出す（数字が増えていれば止まっていない）
//   ・時間切れ・通信失敗のときの文言
// 秒数の数字だけを書き換えるので、画面全体を描き直さない（表のスクロール位置などが戻らない）

import { el } from './format.js'

const ELAPSED_CLASS = 'js-loading-elapsed'

/** 取得を始めてからの秒数の文言（例：「12秒」） */
export function elapsedText(startedAt, now = Date.now()) {
  return `${Math.max(0, Math.floor((now - startedAt) / 1000))}秒`
}

/** 「取得中… 0秒」の文言の部品。秒数の部分は startElapsedTicker が1秒ごとに書き換える */
export function loadingStatusLine(startedAt) {
  const line = el('span', 'top-status-line is-loading', '取得中… ')
  line.appendChild(el('span', `num ${ELAPSED_CLASS}`, elapsedText(startedAt)))
  return line
}

/**
 * container の中の秒数の表示を、1秒ごとに書き換え始める。止めるための関数を返す。
 * （途中で画面が描き直されても、新しい秒数の部品を探して書き換える）
 */
export function startElapsedTicker(container, startedAt) {
  const id = setInterval(() => {
    container.querySelectorAll(`.${ELAPSED_CLASS}`).forEach((node) => {
      node.textContent = elapsedText(startedAt)
    })
  }, 1000)
  return () => clearInterval(id)
}

/** 取得に失敗したときの文言。時間切れなら、何秒待ったかも出す */
export function fetchErrorMessage(error) {
  if (error?.timedOut) return `${error.seconds}秒待っても届かず、取得できませんでした`
  return '取得できませんでした'
}

/** 上の欄の取得時刻の横に付ける札（保存済みの予報を出していることを示す） */
export function fallbackBadgeText(error) {
  return error?.timedOut ? '時間切れ' : 'オフライン'
}

/** 更新ボタンの矢印を、取得中は回す */
export function setRefreshSpinning(button, spinning) {
  button.classList.toggle('is-loading', spinning)
  if (spinning) button.setAttribute('aria-busy', 'true')
  else button.removeAttribute('aria-busy')
}
