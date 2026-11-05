// アプリのアイコン（PNG各サイズ）を public/icon.svg から自動生成する設定。
// アイコンを変えたいときは public/icon.svg を編集して `npm run icons` を実行する。
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // 背景つきの絵なので、周りの余白は夜空の色で埋める
    // 絵が全面に描かれているので、マスク用（丸く切り抜かれる版）は余白なしにする
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#0b1026' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0b1026' } },
  },
  images: ['public/icon.svg'],
})
