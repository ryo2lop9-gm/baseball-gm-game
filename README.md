# ⚾ Baseball GM Game

野球の試合シミュレーションとGM意思決定を融合したブラウザゲーム。  
プレイヤーはGMとしてチーム運営を行い、試合は自動で進行する。

---

# コンセプト

- プレイヤーは「操作する人」ではなく「意思決定する人」
- 試合は自動進行（シミュレーション）
- 重要な場面のみ「意思決定カード」で介入

---

# 現在の起動構成

```text
main.js
└ bootstrap/appBootstrap.js
main.js は起動専用
bootstrap/appBootstrap.js は依存配線専用
画面切替は bootstrap/router.js
保存復元は bootstrap/persistence.js
保存UIは bootstrap/saveControls.js
アーキテクチャ概要
1. Entry / Bootstrap層
bootstrap/
├ appBootstrap.js
├ appRouter.js
├ router.js
├ persistence.js
├ saveControls.js
├ rootStateFactory.js
├ rootStateStore.js
├ gmBootstrap.js
└ tuningBootstrap.js

役割:

アプリ起動
依存配線
root state 構築
保存復元
画面遷移
2. Engine層
engine/
├ core/
│  ├ engineCore.js
│  ├ eventEngine.js
│  └ presentationEngine.js
├ game/
│  ├ gameEngine.js
│  ├ leagueEngine.js
│  └ seasonEngine.js
├ gm/
│  ├ gmEngine.js
│  ├ gmDecisionEngine.js
│  ├ gmRosterEngine.js
│  ├ gmInboxEngine.js
│  └ editorEngine.js
└ stats/
   └ statsEngine.js

役割:

試合進行
シーズン進行
GM進行
統計集計
3. Service層
Pure calculation service
services/
├ zoneService.js
├ pitchOutcomeService.js
├ qocService.js
├ contractService.js
├ rosterDecisionService.js
└ transactionService.js

役割:

純計算
ルール処理
確率計算
意思決定補助
Orchestration / Facade service
services/
├ gm/
│  └ gmFacade.js
└ tuning/
   └ tuningFacade.js

役割:

page から engine 直結を避ける
複数 engine / service の呼び出しを束ねる
UI層から見た入口を単純化する
4. Config層
config/
├ zoneConfig.js
├ pitchConfig.js
├ qocConfig.js
├ hitOutcomeConfig.js
├ pitchResultConfig.js
└ gmConfig.js

役割:

バランス調整
閾値管理
係数管理
5. State層
state/
├ gameState.js
└ appState.js

役割:

試合状態
アプリ全体状態
6. UI層
pages/
├ gmDeskPage.js
├ statsPage.js
└ tuningPage.js

render/
├ gmRender.js
├ statsRender.js
└ tuningRender.js

役割:

DOMイベント受付
画面描画
view更新
依存方向

原則:

main
→ bootstrap
→ pages
→ services/facade
→ engine
→ config / pure services / state

禁止したい依存:

pages から engine への直接依存
render から state の直接書き換え
appBootstrap に業務ロジックを増やすこと
現在の整理状況
すでに整理済み
main.js は起動専用
appBootstrap.js は配線中心
tuningPage.js は tuningFacade.js 経由
保存UIを saveControls.js へ分離
root state の生成 / 保管を分離
まだ今後の本丸
engine/core/engineCore.js のさらなる分解
試合解決ロジックの service / config 退避
gmFacade.js の責務細分化
シミュレーション設計
MLB基準の再現
指標	目標値
OBP	.310〜.320
SLG	.400前後
HR/FB	約10%
打球品質（QoC）
Weak / Topped / Under / Flare / Solid / Barrel

コース × 能力 × 球種で決定。

ゾーン設計
A：厳しいコース（空振り増）
B：平均的コース
C：甘い球（長打増）
開発フロー
① 編集（VS Code）
コード修正
↓
動作確認
② Git反映
git add .
git commit -m "変更内容"
git push
今後の改善予定
優先度高
 engineCore の完全分解
 進塁 / 得点 / イニング遷移ロジックの service 化
 pitch結果分布の統合
 MLB統計との完全一致
中期
 UI改善（実況風）
 トレードロジック高度化
 AIチーム思考導入
長期
 マルチシーズン
 ドラフト
 育成システム
設計思想
ロジックと数値を分離する
状態と表示を分離する
page から engine を直接触らない
bootstrap は配線専用に保つ
変更しやすい構造を優先する
Author

Ryosuke Teramura