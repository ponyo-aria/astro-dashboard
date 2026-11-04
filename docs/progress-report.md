# 進捗報告

このファイルには、各ステップで決めたことと進捗を記録する。

## 決定事項（プロジェクト全体）

- フォルダ構成：`src/screens`（画面）、`src/logic`（判定・天文計算ロジック）、`src/api`（通信）、`src/storage`（保存）、`src/config.js`（しきい値などの設定）、`tests`（テスト）、`public`（アイコンなど静的ファイル）
- GitHub Pages への公開方法：シンプルな方法（`npm run build` → `gh-pages` パッケージで公開用ブランチに反映）を採用
- GitHub のメールアドレスは非公開にし、コミットには noreply アドレスを使う（手順は Step 0 の報告に記載）
- APIキーやパスワードなどの秘密情報はコミットしない
- 報告書を含め、住所など個人を特定できる情報は書かない

## Step 0：開発環境と土台づくり

- Vite（vanilla JavaScript）でプロジェクトの土台を作成
- 上記フォルダ構成で配置
- 「Hello」を表示する画面を作成
- Vitest を導入し、ダミーテスト1件を用意
- `npm test` が通ることを確認
- `npm run build` が通ることを確認
- GitHub リポジトリ作成・Pages 公開は、この後オーナーと一緒に進める
