# ⚾ Baseball GM Game

野球の試合シミュレーションとGM意思決定を融合したブラウザゲーム。
プレイヤーはGMとしてチーム運営を行い、試合は自動で進行する。

---

# 🎮 コンセプト

* プレイヤーは「操作する人」ではなく「意思決定する人」
* 試合は自動進行（シミュレーション）
* 重要な場面のみ「意思決定カード」で介入

---

# 🧠 アーキテクチャ概要

本プロジェクトは責務ごとに分離された構造を持つ。

## 🔹 1. Engine層（ロジック）

試合進行・GM進行などのコア処理

```
engineCore.js        // 1球単位の試合進行
gameEngine.js        // 試合全体の制御
leagueEngine.js      // シーズン進行
gmEngine.js          // GMモード司令塔
eventEngine.js       // 意思決定カード生成
```

---

## 🔹 2. Service層（計算ロジック）

純粋関数としての処理群

```
services/
├ zoneService.js
├ pitchOutcomeService.js
├ qocService.js
├ contractService.js
├ rosterDecisionService.js
├ transactionService.js
```

---

## 🔹 3. Config層（バランス調整）

ゲームバランスはここで管理

```
config/
├ zoneConfig.js        // コース分布
├ pitchConfig.js       // 球種・制球・スイング
├ qocConfig.js         // 打球品質（QoC）
├ hitOutcomeConfig.js  // 打球結果
├ gmConfig.js          // GM設定
```

👉 **数値調整はここだけで完結**

---

## 🔹 4. GM分離構造（重要）

```
gmEngine.js            // 司令塔（進行のみ）
gmDecisionEngine.js    // 意思決定処理
gmRosterEngine.js      // ロースター操作
gmInboxEngine.js       // メッセージ管理
```

👉 責務分離により拡張性を確保

---

## 🔹 5. State層

```
gameState.js   // 試合状態
appState.js    // アプリ全体状態
```

---

## 🔹 6. UI層

```
pages/
├ gmDeskPage.js
├ statsPage.js
├ tuningPage.js

render系
├ gmRender.js
├ statsRender.js
├ tuningRender.js
```

---

# ⚙️ シミュレーション設計

## 📊 MLB基準の再現

| 指標    | 目標値       |
| ----- | --------- |
| OBP   | .310〜.320 |
| SLG   | .400前後    |
| HR/FB | 約10%      |

---

## 🎯 打球品質（QoC）

```
Weak / Topped / Under / Flare / Solid / Barrel
```

👉 コース × 能力 × 球種で決定

---

## 🎯 ゾーン設計

```
A：厳しいコース（空振り増）
B：平均的コース
C：甘い球（長打増）
```

---

## 🎯 意思決定システム

例：

* FA契約
* トレード
* 昇格
* 負傷対応

👉 「カード形式」で提示

---

# 🚀 開発フロー

## ① 編集（VS Code）

```
コード修正
↓
動作確認
```

## ② Git反映

```bash
git add .
git commit -m "変更内容"
git push
```

---

# 📁 今後の改善予定

## 🔥 優先度高

* [ ] engineCoreの完全config化
* [ ] pitch結果分布の統合
* [ ] MLB統計との完全一致

## ⚙️ 中期

* [ ] UI改善（実況風）
* [ ] トレードロジック高度化
* [ ] AIチーム思考導入

## 🎮 長期

* [ ] マルチシーズン
* [ ] ドラフト
* [ ] 育成システム

---

# 💡 設計思想

* ロジックと数値を分離する
* 状態と表示を分離する
* 変更しやすい構造を優先する

---

# 📌 補足

このプロジェクトは

👉 **「調整できるシミュレーター」**

を目指して設計されている。

---

# 🧑‍💻 Author

Ryosuke Teramura

---
