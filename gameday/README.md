# o11y Game Day

OpenTelemetry DemoにFeature Flagsで障害を注入し、Splunk APM/Infrastructureで原因を特定するチャレンジゲーム。

![構成図](./docs/gameday-aws-architecture.drawio.png)

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

### コンセプト

参加者はSREチームの一員として、「顧客からの問い合わせ」「同僚からの相談」「システムアラート」を起点に障害調査を行うロールプレイ形式。APM Trace だけでなく、Service Map、RUM（Real User Monitoring）、Infrastructure Navigator、Browser DevTools など、複数の可観測性シグナルを横断的に活用する。

### フラグ運用方針

全フラグを同時に有効化する（単一フェーズ、全8問同時出題）。デプロイ時に `--enable-flags` を指定すると自動的に有効化される。

有効化するフラグ一覧：
- `productCatalogFailure` - 特定商品のみエラー（Q1で使用）
- `cartFailure` - Redis接続失敗（Q3で使用）
- `imageSlowLoad` - Envoyフォルトインジェクションによる画像遅延（Q4, Q8で使用）
- `adHighCpu` - CPUタイトループによるリソース異常（Q6で使用）
- `paymentUnreachable` - 不正ホストへのgRPC接続失敗（Q7で使用）

### 設問一覧（全8問）

| # | トリガー | シグナル | Flag | サービス | シナリオ概要 | 回答 |
|---|---------|---------|------|----------|-------------|------|
| 1 | 顧客 | APM Trace | `productCatalogFailure` | product-catalog | 商品ページエラー報告 → エラーTrace から影響商品IDを特定 | `OLJCESPC7Z` |
| 2 | 同僚 | Service Map | なし | checkout | 下流アーキテクチャ把握 → Kafka経由の下流サービスを特定 | `accounting` or `fraud-detection` |
| 3 | 顧客 | APM Trace | `cartFailure` | cart | カートが空にできない → 例外メッセージからデータストア種類を特定 | `redis` |
| 4 | 顧客 | RUM | `imageSlowLoad` | frontend | 画像表示が遅い → RUMで遅延リクエストのURLパスパターンを特定 | `images` |
| 5 | 同僚 | RUM Tag Spotlight | なし | frontend | ユーザー層の分析依頼 → enduser.role で最多ロールを特定 | `Guest` |
| 6 | アラート | Infrastructure | `adHighCpu` | ad | CPU使用率上昇アラート → Infrastructure Navigator で高CPU ワークロードを特定 | `ad` |
| 7 | アラート | Service Map | `paymentUnreachable` | checkout | エラー率上昇アラート → Service Map で障害サービスを特定 | `payment` |
| 8 | 顧客 | Browser DevTools | `imageSlowLoad` | frontend | Q4の深堀り → DevToolsで遅延制御HTTPヘッダー名を特定 | `x-envoy-fault-delay-request` |

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
