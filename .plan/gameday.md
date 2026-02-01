# o11y Game Day実装計画

## コンセプト

実際に障害のあるアプリケーションの計装から、事前知識ほぼ無しの状態でo11yを用いたトラブルシューティングを行うチャレンジゲームをアカウントチームから顧客へ提供する。
顧客(以下ゲーム参加者)は、提示された環境で発生している障害を、Splunk Observabitlity Cloud利用して原因特定を行う。

ゲーム参加者は、チームごとに割り当てられた回答ページを用いて、原因と思われる内容を入力し、正解することで得点を得る。一定時間経過後にチーム間で進行状況の比較を行う。

## 技術選定

- **インフラ**: AWS EKS (namespace分離方式)
- **IaC**: AWS SAM
- **管理アプリ**: Express.js + DynamoDB
- **リージョン**: ap-northeast-1 (東京)

## 実装ステップ

### ステップ1: ローカルデプロイ確認 ✅ 完了

**目的**: Splunk Observability Cloudへのテレメトリ送信を確認

**実施内容**:
- kind Kubernetesクラスタで動作確認
- Splunk OTel Collector設定修正（SPLUNK_HEC_TOKEN不要化）
- フロントエンド動作確認

**コミット**: `4a1e78c fix: disable splunk_hec exporter to avoid missing token error`

---

### ステップ2: EKSデプロイスクリプト ✅ 完了

**目的**: チーム数分のnamespaceを一括デプロイ

**構成**:
```
gameday/
└── infra/
    ├── template.yaml          # EKSクラスタ用SAMテンプレート
    ├── deploy-teams.sh        # チームデプロイスクリプト
    ├── cleanup-teams.sh       # クリーンアップスクリプト
    └── list-teams.sh          # チーム一覧表示
```

**デプロイコマンド**:
```bash
# EKSクラスタ作成
sam deploy --stack-name gameday-eks ...

# チームデプロイ
./gameday/infra/deploy-teams.sh --team-count 5 --splunk-token xxx --splunk-realm jp0
```

**検証結果**:
- [x] EKSクラスタ作成 (gameday-otel-demo)
- [x] 3ノード (t3.xlarge) Ready
- [x] Splunk OTel Collector稼働
- [x] team-01 namespace デプロイ成功
- [x] フロントエンドアクセス確認
- [x] クリーンアップスクリプト動作確認
- [x] deployment.environment タグによるチーム識別
- [x] Cleanupデフォルト全削除、--keep-collectorでCollector保持

**コミット**:
- `05c8777 feat: add o11y Game Day infrastructure and admin app`
- `d14a7d4 fix: update cleanup script for EKS namespace deployment`
- `c958b32 feat: add deployment.environment and improve cleanup defaults`

---

### ステップ3: イベント運営WEBアプリ 🔄 実装済み（未テスト）

**目的**: スコア管理・回答収集用のシンプルなWebアプリ

**構成**:
```
gameday/
└── admin-app/
    ├── src/
    │   ├── index.ts           # Express.jsエントリポイント
    │   ├── routes/
    │   │   ├── teams.ts       # チーム管理API
    │   │   ├── answers.ts     # 回答送信API
    │   │   ├── questions.ts   # 設問API
    │   │   └── admin.ts       # 運営用API
    │   └── services/
    │       ├── dynamodb.ts    # DynamoDB接続
    │       └── scoring.ts     # 得点計算ロジック
    ├── public/
    │   ├── team.html          # チーム回答画面
    │   └── admin.html         # 運営ダッシュボード
    ├── template.yaml          # DynamoDB/ECS SAMテンプレート
    ├── Dockerfile
    └── package.json
```

**DynamoDB テーブル**:
| テーブル名 | PK | SK | 用途 |
|-----------|----|----|------|
| gameday-teams | team_id | - | チーム情報・進捗 |
| gameday-answers | team_id | question_id | 回答履歴・得点 |
| gameday-questions | question_id | - | 設問マスタ |

**Todo**:
- [ ] DynamoDBテーブル作成・デプロイ
- [ ] ECS Fargateへのデプロイ
- [ ] 動作検証

---

### ステップ4: 設問・回答・得点システム 🔄 実装済み（未テスト）

**使用Feature Flags と設問**:

| Flag | サービス | 設問 | 正解キーワード | 点数 |
|------|----------|------|---------------|------|
| adFailure | ad | GetAds RPCが失敗する原因のメソッド名は？ | `getAds`, `AdService` | 100 |
| adManualGc | ad | 手動GCをトリガーするクラス名は？ | `GarbageCollectionTrigger` | 100 |
| cartFailure | cart | Cart操作失敗の原因となるストア名は？ | `_badCartStore` | 100 |
| productCatalogFailure | product-catalog | エラーとなる商品IDは？ | `OLJCESPC7Z` | 100 |
| paymentFailure | payment | 支払い失敗するユーザー属性は？ | `gold` | 100 |
| paymentUnreachable | checkout | 到達不能なアドレスは？ | `badAddress:50051` | 100 |
| recommendationCacheFailure | recommendation | 問題の機能名は？ | `cache`, `cached_ids` | 100 |
| emailMemoryLeak | email | メモリリークの原因処理は？ | `send_email`, `deliveries` | 100 |
| imageSlowLoad | frontend | 遅延を引き起こすHTTPヘッダーは？ | `x-envoy-fault-delay-request` | 100 |
| kafkaQueueProblems | kafka | キュー問題の原因は？ | `kafka`, `producer` | 100 |

**得点計算**:
- 基本点 × (1 - 経過分 × 0.005) - 誤答ペナルティ(5点/回)
- 最低得点: 10点（正解時）

**Todo**:
- [ ] Feature Flag有効化テスト
- [ ] 回答→得点加算の動作検証

---

### ステップ5: Stage2（FIS）⏳ 未着手

**目的**: アプリ全問クリア後にインフラ障害を追加

**FIS実験テンプレート**:
- CPU Stress（stress-ng使用）
- Memory Stress
- Network Latency

**移行条件**: Stage1全問正解 または 運営手動移行

**追加設問**: Splunk Infrastructure Monitoringから読み取れる情報を回答

**Todo**:
- [ ] FIS実験テンプレート作成
- [ ] Stage2設問実装
- [ ] 自動移行ロジック実装

---

## Critical Files

- `splunk/docker-compose.yml` - Splunk版Docker Compose
- `splunk/opentelemetry-demo.yaml` - Kubernetes マニフェスト
- `splunk/otelcol-config.yml` - OTel Collector設定（修正済み）
- `src/flagd/demo.flagd.json` - Feature Flag定義
- `.env` - 環境変数

## タグ要件

全AWSリソースに付与:
- `splunkit_data_classification`: `public`
- `splunkit_environment_type`: `non-prd`

## 考慮事項

- 運営側は、専用のダッシュボード画面で進捗を確認できる
- 認証認可は設定せず、紳士協定でアクセスしないことを前提
- Splunk Cloudは配布環境に含めないため、ログデータ送出なしでCollector動作可能（確認済み）
