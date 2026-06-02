# GMゲーム開発基本ルール

本プロジェクトでは、機能追加を重ねても破綻しないように、以下の開発ルールを共通原則とする。

## 1. EngineとUIを分離する

試合処理、守備処理、成績集計、GM判断などのロジックは、DOMやHTMLを直接操作しない。

Engineは状態を受け取り、更新後の状態または結果オブジェクトを返す。

UIはEngineの結果を受け取り、表示だけを担当する。

悪い例：

```js
simulatePitch内でdocument.getElementByIdを操作する。
```

良い例：

```js
simulatePitch(state) が newState を返し、renderGame(newState) が表示する。
```

## 2. Stateを唯一の真実とする

ゲーム状態は appState に集約する。

スコア、選手成績、チーム状態、日付、ロースター、GMイベントなどを複数箇所で重複管理しない。

表示値は常に state から生成する。

## 3. 数値はConfigに分離する

調整可能な数値は、ロジック内に直接書かず、configファイルに置く。

例：

- 走者速度補正
- 守備速度補正
- 打球飛距離補正
- エラー率
- OAAの上下限
- 球場補正
- 成績補正係数

これにより、バランス調整時にロジックを壊さず数値だけ変更できる。

## 4. ロジックをコピーしない

同じ計算を複数箇所に書かない。

共通処理は関数化する。

例：

```js
getCountProfile(count)
calculateOPS(stats)
getRunnerArrivalTime(runner, base)
calculateOAA(result)
```

同じ処理が複数ファイルにある場合、将来の修正漏れやバグの原因になる。

## 5. 関数の入力と出力を明確にする

関数は、何を受け取り、何を返すかを明確にする。

悪い例：

```js
simulateGame() が内部でstateを直接変更し、何を返すか不明。
```

良い例：

```js
simulateGame(state, config) -> newState
resolveDefense(battedBall, defenseContext) -> defenseResult
```

入力と出力が明確な関数ほど、テスト・デバッグ・再利用がしやすい。

## 6. State Machineを使う

複雑な処理は、深いif文ではなく状態遷移として管理する。

試合処理の例：

```txt
PREGAME
INNING_START
AT_BAT
PITCH
BALL_IN_PLAY
INNING_END
GAME_END
```

守備処理の例：

```txt
MOVING_TO_BALL
FIELDING
TRANSFER
DECISION
THROWING
RECEIVING
RUNNER_COMPARE
COMPLETED
ERROR_STATE
```

GMイベント処理の例：

```txt
GENERATE
SHOW
DECISION
RESOLVE
APPLY_RESULT
```

これにより、どの段階で処理が止まったのか、どこでエラーが起きたのかを追いやすくなる。

## 7. ランダム処理を分離する

Math.random() を各所に直接書かない。

必ず共通関数を使う。

例：

```js
rollChance(probability)
randomRange(min, max)
randomNormal(mean, sd)
pickWeighted(options)
```

これにより、将来的にシード固定、リプレイ、検証、デバッグが可能になる。

## 8. 能力値は原則100基準に統一する

選手能力は基本的に0〜100で統一する。

例：

- contact
- power
- eye
- speed
- range
- reaction
- fielding
- arm
- accuracy
- stamina
- leadership

内部計算では必要に応じて秒、mph、確率に変換する。

表示用能力値と計算用数値を混同しない。

## 9. 計算結果は必要に応じて保存する

大量シミュレーションでは、毎回すべてを再計算しない。

シーズン成績、チーム成績、OAA、OPS、WARなどは、必要に応じて集計済みデータとして保存する。

ただし、保存値の元になる一次データと矛盾しないようにする。

## 10. ログを残す

重要なエンジン処理では、debugLogを残す。

例：

- 投球ログ
- 打球ログ
- 守備ログ
- 走塁ログ
- GM判断ログ
- AI判断ログ
- 成績更新ログ

ログには、結果だけでなく「なぜそうなったか」を残す。

守備ログ例：

- 打球座標
- 担当野手
- 移動距離
- expectedOutProbability
- actualOutProbability
- 送球先
- 結果
- OAA

## 11. ファイル責務を一つにする

一つのファイルに複数の責務を詰め込まない。

例：

```txt
gameEngine.js -> 試合進行
battingEngine.js -> 打撃処理
fieldingEngine.js -> 守備処理
baseRunningEngine.js -> 走塁処理
seasonEngine.js -> シーズン進行
gmEngine.js -> GM判断・球団運営
statsService.js -> 成績集計
render.js -> 表示処理
config.js -> 調整用数値
```

ファイル名と中身の責務を一致させる。

## 12. ViewModelを使う

UIにappStateを直接渡さない。

表示に必要な形へ整形したViewModelを作る。

例：

```js
createGameViewModel(state)
createPlayerStatsViewModel(state)
createGMDeskViewModel(state)
```

render関数はViewModelを受け取り、表示するだけにする。

## 13. AIを前提にした設計にする

将来的に、GM AI、監督AI、守備AI、走塁AI、トレードAIを追加できるようにする。

そのため、意思決定処理は以下のような関数に分離する。

```js
getBestDefenseDecision(context)
getBestBaseRunningDecision(context)
getBestTradeDecision(context)
getBestLineupDecision(context)
```

AI判断と結果処理を混ぜない。

## 14. Visual Debuggerを用意する

数値だけではバグを発見しにくいため、可能な限り可視化する。

守備なら以下を表示する。

- 打球座標
- 野手位置
- 野手移動ベクトル
- 送球ベクトル
- 走者進塁ベクトル
- expectedOutProbability
- actualOutProbability
- OAA
- エラー種別

GM画面なら以下を表示する。

- 予算変化
- 選手評価変化
- ロースター変化
- AI判断理由
- イベント影響

## 15. 最小実装から始める

最初から完成版を作らない。

必ず小さい単位で実装し、動作確認してから拡張する。

守備実装の順番例：

1. 座標を持たせる
2. 距離を計算する
3. 担当野手を決める
4. アウト確率を出す
5. OAAを加算する
6. 送球時間を追加する
7. 走力を追加する
8. 併殺を追加する
9. シフトを追加する
10. Decision AIを追加する

小さく動かし、小さく検証し、小さく拡張する。

## 16. Config・Engine・Renderを混ぜない

Configは数値。

Engineは計算。

Renderは表示。

この3つを混ぜない。

悪い例：

- render関数内で成績計算をする。
- engine内でHTMLを作る。
- config内で状態を変更する。

良い例：

1. configから数値を読む。
2. engineで結果を計算する。
3. ViewModelを作る。
4. renderで表示する。

## 17. 破壊的変更にはバージョンを付ける

state構造や保存データ形式を変更する場合は、STORAGE_VERSIONを更新する。

古いlocalStorageと新しいコードが衝突しないようにする。

## 18. デバッグ用と本番用を分ける

debugModeを用意する。

debugModeがtrueのときだけ、詳細ログやVisual Debuggerを表示する。

通常プレイでは表示を簡潔にする。

## 19. 指標は意味を分ける

似た指標を混同しない。

例：

```txt
OAA -> 守備能力評価
clutchOAA -> 勝負所での守備貢献
WAR -> 勝利換算
OPS -> 打撃結果
x系指標 -> 期待値
```

実績値と期待値を混ぜない。

## 20. 最重要3原則

本プロジェクトで特に重要なのは以下の3つである。

1. EngineとUIを分離する。
2. Stateを唯一の真実とする。
3. 数値はConfigに分離する。

この3つを守ることで、守備エンジン、GM AI、ドラフト、トレード、FA、マイナーリーグ、球場要素、AIオーナーなどを後から追加しても破綻しにくくなる。

本開発ルールの目的は、短期的に動くコードを書くことではなく、長期的に拡張できるGMゲームを作ることである。
