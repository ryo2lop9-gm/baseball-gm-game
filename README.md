# Baseball GM Game

## ■ 概要

本プロジェクトは、MLBをベースとしたリアル志向の野球シミュレーションエンジンと、
GM（ゼネラルマネージャー）視点の意思決定ゲームを統合したシステムである。

プレイヤーは試合操作ではなく、
「意思決定」を通じてチームを勝利へ導く。

---

## ■ 設計思想（最重要）

本プロジェクトは以下の原則で設計されている。

### ① 責務分離（Separation of Concerns）

- engine → 試合進行のみ
- services → ロジック
- config → 数値・確率
- pages → UI

👉 UIはロジックを持たない  
👉 engineは計算を持たない  

---

### ② engineCore は「司令塔」

engineCore は以下のみ担当する。

- 1球進行
- state更新
- serviceの呼び出し

👉 ロジックは禁止  
👉 計算は禁止  

---

### ③ ロジックはすべて services に集約

すべての処理は service に逃がす。

例：

- 打席結果 → plateAppearanceService
- 打球結果 → contactResolutionService
- 進塁 → baseRunningService
- イニング管理 → inningStateService
- 投手交代 → pitchingChangeService
- 成績更新 → statsUpdateService

---

### ④ 数値は config に集約

- 打球割合
- スイング率
- 球種分布

👉 engine に数値を書かない

---

## ■ ディレクトリ構成


project/
├─ engine/
│ ├─ core/
│ │ └─ engineCore.js
│ ├─ game/
│ │ ├─ gameEngine.js
│ │ ├─ leagueEngine.js
│ │ └─ seasonEngine.js
│
├─ services/
│ ├─ baseRunningService.js
│ ├─ inningStateService.js
│ ├─ plateAppearanceService.js
│ ├─ contactResolutionService.js
│ ├─ pitchingChangeService.js
│ ├─ statsUpdateService.js
│ ├─ gameStateHelperService.js
│ ├─ pitchExecutionService.js
│ ├─ plateAppearanceStateService.js
│ ├─ boxScoreService.js
│
├─ config/
│ ├─ pitchConfig.js
│ ├─ qocConfig.js
│ ├─ hitOutcomeConfig.js
│ ├─ zoneConfig.js
│
├─ pages/
│ ├─ gmDeskPage.js
│ ├─ statsPage.js
│ ├─ tuningPage.js
│
├─ bootstrap/
│ ├─ appRouter.js
│ ├─ gmBootstrap.js
│ └─ tuningBootstrap.js
│
├─ main.js
└─ index.html


---

## ■ データフロー


UI (pages)
↓
controller / bootstrap
↓
engineCore（進行）
↓
services（ロジック）
↓
state 更新
↓
UI 描画


---

## ■ state の責務

state は唯一の真実（Single Source of Truth）

含む内容：

- 試合状況（inning, outs, bases）
- スコア
- 打順
- 投手状態
- 成績

👉 services は state を更新する  
👉 UI は state を読むだけ  

---

## ■ engineCore の責務（厳密定義）

engineCore は以下のみ許可：

- service呼び出し
- state更新
- 進行制御

禁止事項：

- 確率計算
- 成績ロジック
- 進塁ロジック

---

## ■ services の責務

services は以下を担当：

- ビジネスロジック
- 確率処理
- 分岐

特徴：

- 単体テスト可能
- 再利用可能
- UI非依存

---

## ■ config の責務

config はすべての調整値を管理：

- QoC割合
- スイング率
- 球速分布

👉 バランス調整はここで行う

---

## ■ 今後の拡張予定

### ① GMシステム

- トレード
- FA契約
- ラインナップ変更

---

### ② 意思決定カード

- 怪我
- 成績低迷
- 契約交渉

---

### ③ 高度なデータ分析

- QoC別成績
- 球種別打率
- ゾーン別成績

---

### ④ engineCore の最終分解（将来）

- 完全ステートマシン化
- イベント駆動化

---

## ■ 開発ルール（重要）

### ❌ やってはいけない

- engineCore にロジックを書く
- services から DOM を触る
- pages から engine を直接操作する

---

### ✅ 必ず守る

- ロジックは services に書く
- 数値は config に書く
- UI は state だけ読む

---

## ■ このプロジェクトの本質

このゲームは

👉「操作するゲーム」ではない  
👉「意思決定するゲーム」である  

---

## ■ コンセプト

**The Desk of GM**

プレイヤーは現場ではなく、
デスクからチームを動かす。

---