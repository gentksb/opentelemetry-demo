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

### 2. チームnamespaceのデプロイ（SSM経由）

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name gameday-kind --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)

aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo -u ec2-user bash /home/ec2-user/opentelemetry-demo/gameday/infra/deploy-teams.sh --team-count 1 --splunk-token <TOKEN> --splunk-realm jp0 --cluster-name gameday-kind"]}' \
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

全フラグを同時に有効化する。`productCatalogFailure`は特定商品のみに影響するため、checkoutフローはブロックされない。

| Flag | 設定値 | サービス | 設問 | 回答 |
|------|--------|----------|------|------|
| productCatalogFailure | ON | product-catalog | エラースパンの`app.product.id`属性の値は？ | `OLJCESPC7Z` |
| adFailure | ON | ad | gRPCエラーのステータスコードは？ | `UNAVAILABLE` |
| recommendationCacheFailure | ON | recommendation | `app.recommendation.cache_enabled`属性の値は？ | `true` |
| paymentFailure | 50% | payment | エラースパンの`peer.service`属性の外部サービス名は？ | `ButtercupPayments` |
| cartFailure | ON | cart | 例外メッセージで接続失敗しているストレージの種類は？ | `redis` |

## クリーンアップ

```bash
# チームnamespace削除
./gameday/infra/cleanup-teams.sh --team-count <N>

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
