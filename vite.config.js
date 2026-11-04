import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス配下に公開されるため、
  // 相対パスにしてどのリポジトリ名でも動くようにする。
  base: './',
})
