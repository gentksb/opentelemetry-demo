# o11y Game Day実装計画

## コンセプト

実際に障害のあるアプリケーションの計装から、事前知識ほぼ無しの状態でo11yを用いたトラブルシューティングを行うチャレンジゲームをアカウントチームから顧客へ提供する。
顧客(以下ゲーム参加者)は、提示された環境で発生している障害を、Splunk Observabitlity Cloud利用して原因特定を行う。

ゲーム参加者は、チームごとに割り当てられた回答ページを用いて、原因と思われる内容を入力し、正解することで得点を得る。一定時間経過後にチーム間で進行状況の比較を行う。

## 技術選定

- **リポジトリ**: splunk/opentelemetry-demo（Kubernetesデプロイ専用）
- **インフラ**: AWS EC2 + kind (namespace分離方式)
- **IaC**: AWS SAM
- **管理アプリ**: Express.js + DynamoDB
- **リージョン**: ap-northeast-1 (東京)

### インフラ選定理由 (2026-02-02)

EKSからEC2 + kindへ変更した理由:
- EKSではEBS CSIドライバーのIRSA設定が複雑
- Game Dayは一時的なイベント用途でマネージドサービスのメリットが薄い
- ローカルkindで動作確認済みの構成をそのまま利用可能
- コスト効率が良い（EKSコントロールプレーン費用不要）

## リポジトリ移行履歴

- **旧リポジトリ**: signalfx/opentelemetry-demo（メンテナンス停止）
- **新リポジトリ**: splunk/opentelemetry-demo（最新版）
- **移行日**: 2026-02-02
- **移行コミット**: GameDay関連コミットをsplunk/mainにリベース

## 実装ステップ

### ステップ1: Kubernetesデプロイ確認 ✅ 完了

**目的**: splunk/opentelemetry-demoでSplunk Observability Cloudへのテレメトリ送信を確認

**実施内容**:
- kindクラスタにsplunk-astronomy-shopマニフェストをデプロイ
- `workshop-secret`でSplunk認証情報を設定
- Splunk OTel Collector (Helm) 経由でテレメトリ送信確認

**検証結果** (2026-02-02):
- [x] kindクラスタ起動
- [x] `kubernetes/splunk-astronomy-shop-1.5.5.yaml` デプロイ成功
- [x] Splunk OTel Collector (Helm) インストール成功
- [x] Infrastructure Monitoring でクラスタ表示確認
- [x] APM でトレース受信確認

**使用マニフェスト**: `kubernetes/splunk-astronomy-shop-1.5.5.yaml`

**必要なSecret** (`kubernetes/secrets.yaml` - gitignore対象):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: workshop-secret
stringData:
  realm: jp0
  access_token: <SPLUNK_ACCESS_TOKEN>
  env: <deployment-environment>
  # ... その他オプション設定
```

---

### ステップ2: EC2 + kindデプロイ ✅ 検証完了

**目的**: チーム数分のnamespaceを一括デプロイ

**構成**:
```
gameday/
└── infra/
    ├── ec2-kind-template.yaml  # EC2 + kind用SAMテンプレート
    ├── template.yaml           # (旧) EKSクラスタ用SAMテンプレート
    ├── deploy-teams.sh         # チームデプロイスクリプト
    ├── cleanup-teams.sh        # クリーンアップスクリプト
    └── list-teams.sh           # チーム一覧表示
```

**EC2 + kind構成** (2026-02-02):
- [x] EC2インスタンス (m5.2xlarge) でkindクラスタを実行
- [x] UserDataでDocker, kind, kubectl, Helmを自動インストール
- [x] Splunk OTel Collector (Helm) 自動インストール
- [x] `workshop-secret` 自動作成機能
- [x] NodePortでフロントエンド公開 (port 30080 → 8080)

**デプロイコマンド**:
```bash
# EC2 + kindスタック作成
sam deploy --template-file ec2-kind-template.yaml \
  --stack-name gameday-kind \
  --parameter-overrides \
    InstanceType=m5.2xlarge \
    KeyName=tgen-key \
    SplunkAccessToken=xxx \
    SplunkRealm=jp0 \
    TeamCount=1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1

# SSHでEC2に接続後、チームデプロイ
./deploy-teams.sh --team-count 5 --splunk-token xxx --splunk-realm jp0
```

**検証結果** (2026-02-02):
- [x] EC2インスタンス起動
- [x] kindクラスタ作成
- [x] Splunk OTel Collector動作確認
- [x] デモアプリ (23/25 pods) 稼働
- [x] フロントエンドアクセス確認 (HTTP 200)
- [x] `/feature` (flagd-ui) アクセス確認 (HTTP 200) - メモリ2560MiBで動作

**注意点**:
- マニフェスト内の `storageClassName: local-path` を `standard` に変更が必要
- shop-dc-shim コンポーネント (namespace: default固定) はスキップされる
- **flagd-ui メモリ問題** (2026-02-02 解決): EC2 (32GB) 環境でErlang VM (beam.smp) がホストメモリを参照して過剰なメモリ割り当てを行い、デフォルト250MiBでOOMKilled発生。2560MiBに増加で解決
- frontend-proxyはNodePortに変更が必要 (port 30080+チーム番号)

---

### ステップ3: イベント運営WEBアプリ ✅ 実装・テスト完了

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
    ├── dynamodb-only.yaml     # DynamoDBテーブルのみ（ローカル開発用）
    ├── Dockerfile
    └── package.json
```

**DynamoDB テーブル** (デプロイ済み: `gameday-*-dev`):
| テーブル名 | PK | SK | 用途 |
|-----------|----|----|------|
| gameday-teams-dev | team_id | - | チーム情報・進捗 |
| gameday-answers-dev | team_id | question_id | 回答履歴・得点 |
| gameday-questions-dev | question_id | - | 設問マスタ |

**検証済みAPI**:
- [x] `GET /api/teams` - チーム一覧取得
- [x] `POST /api/teams` - チーム作成
- [x] `GET /api/questions` - 設問一覧取得
- [x] `POST /api/answers` - 回答送信（正解/不正解判定、得点計算）

**Todo**:
- [ ] ECS Fargateへのデプロイ

---

### ステップ4: 設問・回答・得点システム ✅ 実装完了

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
- [ ] Feature Flag有効化テスト（EC2 + kind環境で）

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

- `kubernetes/splunk-astronomy-shop-1.5.5.yaml` - Kubernetesマニフェスト（推奨版）
- `kubernetes/splunk-astronomy-shop-1.6.0-values.yaml` - Helm values（最新）
- `kubernetes/example-secrets.yaml` - Secret設定例
- `kubernetes/secrets.yaml` - 実際のSecret（gitignore対象）
- `src/flagd/demo.flagd.json` - Feature Flag定義
- `gameday/infra/ec2-kind-template.yaml` - EC2 + kind SAMテンプレート
- `gameday/infra/deploy-teams.sh` - チームデプロイスクリプト
- `gameday/admin-app/` - イベント運営アプリ

## タグ要件

全AWSリソースに付与:
- `splunkit_data_classification`: `public`
- `splunkit_environment_type`: `non-prd`

## 考慮事項

- 運営側は、専用のダッシュボード画面で進捗を確認できる
- 認証認可は設定せず、紳士協定でアクセスしないことを前提
- **Kubernetesデプロイのみ対応**（Docker Compose非対応）
- splunk/opentelemetry-demoはSplunk OTel Collector Helmチャートを使用
