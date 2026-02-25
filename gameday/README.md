# o11y Game Day

OpenTelemetry DemoにFeature Flagsで障害を注入し、Splunk APM/Infrastructureで原因を特定するチャレンジゲーム。

## 前提条件

- AWS CLI（設定済み）
- Docker
- Splunk Observability Cloud アカウント

## デプロイ手順

### 1. EC2 + kindクラスタの作成

```bash
aws cloudformation deploy \
  --template-file gameday/infra/ec2-kind-template.yaml \
  --stack-name gameday-kind \
  --region ap-northeast-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    KeyPairName=<KEY_PAIR> \
    ClusterName=gameday-kind \
    GitBranch=<BRANCH_NAME> \
  --tags \
    splunkit_data_classification=public \
    splunkit_environment_type=non-prd
```

### 2. アプリケーションのデプロイ（SSM経由）

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name gameday-kind --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)

aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo -u ec2-user bash /home/ec2-user/opentelemetry-demo/gameday/infra/deploy-teams.sh --splunk-token <TOKEN> --splunk-realm jp0 --cluster-name gameday-kind --enable-flags"]}' \
  --region ap-northeast-1 --timeout-seconds 600
```

### 3. 管理アプリのデプロイ

```bash
cd gameday/admin-app
./deploy-admin.sh \
  --environment dev \
  --create-dynamodb \
  --cluster-name gameday-kind \
  --splunk-realm jp0 \
  --admin-password <PASSWORD>
```

### 4. 管理アプリのイメージ更新

設問定義（`admin-app/src/services/scoring.ts`）変更後：

```bash
cd gameday/admin-app
./update-image.sh
```

## アクセスURL

| サービス | URL |
|---------|-----|
| フロントエンド | `http://<EC2_IP>:8080` |
| Feature Flag UI | `http://<EC2_IP>:8080/feature/` |
| 管理アプリ（参加者） | `https://<ECS_ENDPOINT>` |
| 管理アプリ（運営） | `https://<ECS_ENDPOINT>/admin` |

## ゲーム設問

### フラグ運用方針

全フラグを同時に有効化する（単一フェーズ、全10問同時出題）。デプロイ時に `--enable-flags` を指定すると自動的に有効化される。

有効化するフラグ一覧：
- `productCatalogFailure` - 特定商品のみエラー（checkoutフローはブロックしない）
- `recommendationCacheFailure` - キャッシュリークによる商品数異常増加
- `cartFailure` - Redis接続失敗
- `paymentUnreachable` - 不正ホストへのgRPC接続失敗
- `kafkaQueueProblems` - Kafkaへの大量メッセージ送信によるレイテンシ増加
- `adHighCpu` - CPUタイトループによるレイテンシ増加
- `adManualGc` - 手動GCトリガーによるStop-The-World停止
- `imageSlowLoad` - Envoyフォルトインジェクションによる画像遅延

### 設問一覧（全10問）

| # | Flag | サービス | 設問概要 | 回答 |
|---|------|----------|----------|------|
| 1 | `productCatalogFailure` | product-catalog | エラースパンの `app.product.id` 属性の値は？ | `OLJCESPC7Z` |
| 2 | なし（基本操作） | checkout | Service MapでcheckoutからKafka経由で受信しているコンシューマーサービス名を1つ答えよ | `accounting` または `fraud-detection` |
| 3 | `recommendationCacheFailure` | recommendation | スパンの `app.recommendation.cache_enabled` 属性の値は？ | `true` |
| 4 | なし（基本操作） | currency | `GetSupportedCurrencies` スパンの `rpc.system` 属性の値は？ | `grpc` |
| 5 | `cartFailure` | cart | `EmptyCart` エラーの例外メッセージで接続失敗しているストレージの種類は？ | `redis` |
| 6 | `paymentUnreachable` | checkout | `PlaceOrder` エラーの `exception.message` に含まれる不正なホスト名は？ | `badAddress` |
| 7 | `kafkaQueueProblems` | checkout | メッセージ送信スパンの `peer.service` 属性の値は？ | `kafka` |
| 8 | `adHighCpu` | ad | Runtime Metricsで最も異常値を示しているリソースの種類は？（CPU/Memory/GC） | `CPU` |
| 9 | `adManualGc` | ad | 急増しているメトリクス `jvm.xx.duration` の「xx」は？ | `gc` |
| 10 | `imageSlowLoad` | frontend | 商品画像リクエストのRequest Headersに追加されるEnvoy遅延制御ヘッダー名は？ | `x-envoy-fault-delay-request` |

## クリーンアップ

```bash
# アプリケーション削除（ローカルのみ利用を推奨、EC2デプロイ時はインフラ毎削除）
./gameday/infra/cleanup-teams.sh --force

# 管理アプリ削除
./gameday/admin-app/deploy-admin.sh --delete --environment dev

# EC2 + kindスタック削除
aws cloudformation delete-stack --stack-name gameday-kind --region ap-northeast-1
```

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| flagdがPending | `local-path` StorageClassが未作成。deploy-teams.shが自動作成するが、手動作成は`kubectl get sc`で確認後対応 |
| Splunkにデータが届かない | `kubectl get pods -n splunk-monitoring` / `kubectl logs -n splunk-monitoring -l app=splunk-otel-collector` |
| Feature Flagが動作しない | `kubectl logs -n <NAMESPACE> deployment/flagd` |
| fraud-detectionがInit状態 | SQL Serverの初期化待ち。`sql-server-fraud-0`がRunningになるまで待機 |
| `/admin` にログインできない | `deploy-admin.sh --admin-password <PASSWORD>` でパスワードを再設定 |
| スコアボードAPIが500エラー | `aws dynamodb list-tables` でテーブル存在確認。なければ `--create-dynamodb` 付きで再デプロイ |
