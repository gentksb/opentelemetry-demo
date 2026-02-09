# o11y Game Day

Splunk Observability Cloudを使用したトラブルシューティングチャレンジゲームの実装。

## 概要

OpenTelemetry DemoアプリケーションにFeature Flagsで障害を注入し、参加チームがSplunk APM/Infrastructureを使用して原因を特定するゲームです。

## 構成

```
gameday/
├── infra/                    # インフラとデプロイスクリプト
│   ├── ec2-kind-template.yaml # EC2 + kind用CloudFormationテンプレート（推奨）
│   ├── template.yaml         # (旧) EKSクラスタ用CloudFormationテンプレート
│   ├── deploy-teams.sh       # チームデプロイスクリプト
│   ├── cleanup-teams.sh      # リソースクリーンアップ
│   └── list-teams.sh         # チーム一覧表示
└── admin-app/                # 運営管理アプリ
    ├── src/                  # Express.js TypeScriptソース
    ├── public/               # フロントエンドHTML
    ├── template.yaml         # ECS + DynamoDB用CloudFormationテンプレート
    ├── deploy-admin.sh       # 管理アプリデプロイスクリプト
    └── Dockerfile
```

## 前提条件

- AWS CLI（設定済み）
- Docker（管理アプリのビルドに必要）
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
    InstanceType=m5.2xlarge \
    KeyName=<YOUR_KEY_NAME> \
    SplunkAccessToken=<YOUR_TOKEN> \
    SplunkRealm=jp0 \
    TeamCount=1 \
  --tags \
    splunkit_data_classification=public \
    splunkit_environment_type=non-prd \
    Project=o11y-gameday
```

EC2インスタンスのUserDataで以下が自動セットアップされます：
- Docker, kind, kubectl, Helm のインストール
- kindクラスタ（`gameday`）の作成
- リポジトリのクローン

### 2. チームのデプロイ（SSM経由）

EC2のUserData完了後、SSM経由でチームをデプロイします。

```bash
# EC2インスタンスIDを取得
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name gameday-kind \
  --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
  --output text)

# SSM経由でdeploy-teams.shを実行
aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo -u ec2-user bash /home/ec2-user/opentelemetry-demo/gameday/infra/deploy-teams.sh --team-count 1 --splunk-token <YOUR_TOKEN> --splunk-realm jp0"]}' \
  --region ap-northeast-1 \
  --timeout-seconds 600
```

SSH接続でも実行可能です：

```bash
# SSHで接続
ssh -i <KEY_NAME>.pem ec2-user@<PUBLIC_IP>

# チームデプロイ
cd ~/opentelemetry-demo
./gameday/infra/deploy-teams.sh \
  --team-count 1 \
  --splunk-token <YOUR_SPLUNK_TOKEN> \
  --splunk-realm jp0
```

### 3. 管理アプリのデプロイ

```bash
./gameday/admin-app/deploy-admin.sh \
  --environment dev \
  --create-dynamodb \
  --cluster-name gameday-kind \
  --splunk-realm jp0 \
  --admin-password <YOUR_PASSWORD>
```

Docker build → ECR push → CloudFormation (ECS Express Mode + DynamoDB) を自動実行します。

### 4. デプロイ確認

```bash
# EC2のPublic IPとURLを確認
aws cloudformation describe-stacks \
  --stack-name gameday-kind \
  --region ap-northeast-1 \
  --query "Stacks[0].Outputs" \
  --output table

# 管理アプリのURLを確認
aws cloudformation describe-stacks \
  --stack-name gameday-admin-dev \
  --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" \
  --output text

# Pod状態確認（SSM経由）
aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo -u ec2-user kubectl get pods -n otel-demo-team-01"]}' \
  --region ap-northeast-1
```

### 5. Splunk Observability Cloudで確認

1. https://app.jp0.signalfx.com にアクセス
2. APM → Explore でサービスマップを確認
3. `deployment.environment = gameday-kind-team-01` でフィルタリング

## アクセスURL

| サービス | URL |
|---------|-----|
| チーム1 フロントエンド | `http://<EC2_PUBLIC_IP>:8080` |
| チーム1 Feature Flag UI | `http://<EC2_PUBLIC_IP>:8080/feature/` |
| 管理アプリ（参加者画面） | `https://<ECS_ENDPOINT>` |
| 管理アプリ（運営画面） | `https://<ECS_ENDPOINT>/admin` |

## オプション

### Splunk OTel Collectorのスキップ

既にインストール済みの場合：

```bash
./deploy-teams.sh --team-count 5 --splunk-token xxx --skip-collector
```

### ドライラン

```bash
./deploy-teams.sh --team-count 5 --splunk-token xxx --dry-run
```

## クリーンアップ

### チームnamespaceの削除

```bash
./gameday/infra/cleanup-teams.sh --team-count 5
```

### 管理アプリの削除

```bash
./gameday/admin-app/deploy-admin.sh --delete --environment dev
```

### EC2 + kindスタックの削除

```bash
aws cloudformation delete-stack --stack-name gameday-kind --region ap-northeast-1
```

## ゲーム設問

### フラグ運用方針

フラグは2グループに分けて有効化する。グループAとBを同時に有効にする場合は、`productCatalogFailure`をOFFにすること（ロードジェネレーターのcheckoutフローをブロックするため）。

### グループA: 独立系障害

checkoutフローに依存せず、各サービスが独立して障害を発生させる。

| Flag | 設定値 | サービス | 設問 | 回答 |
|------|--------|----------|------|------|
| productCatalogFailure | ON | product-catalog | product-catalogサービスでエラーが発生しています。エラースパンの`app.product.id`属性の値は何ですか？ | `OLJCESPC7Z` |
| adFailure | ON | ad | adサービスでgRPCエラーが発生しています。エラーのステータスコードは何ですか？ | `UNAVAILABLE` |
| recommendationCacheFailure | ON | recommendation | recommendationサービスのスパンで`app.products.count`の値が異常に大きくなっています。同じスパンの`app.recommendation.cache_enabled`属性の値は何ですか？ | `true` |

### グループB: checkout連鎖系障害

checkoutフローの成功が前提。`productCatalogFailure`がONだとcheckoutフローがブロックされるためOFFにすること。

| Flag | 設定値 | サービス | 設問 | 回答 |
|------|--------|----------|------|------|
| paymentFailure | 50% | payment | paymentサービスで外部決済APIの呼び出しが失敗しています。エラースパンの`peer.service`属性に表示されている外部サービス名は何ですか？ | `ButtercupPayments` |
| cartFailure | ON | cart | cartサービスのEmptyCart操作でエラーが発生しています。例外メッセージによると、接続に失敗しているストレージの種類は何ですか？ | `redis` |

### フラグ干渉マトリクス

| フラグ | 干渉するフラグ | 理由 |
|--------|---------------|------|
| productCatalogFailure | paymentFailure, cartFailure | 商品ページ描画失敗によりロードジェネレーターのcheckoutフローがブロックされる |
| paymentUnreachable | cartFailure | checkoutがpayment段階で100%失敗し、EmptyCart/Kafka送信に到達しない |

### Stage 2: インフラ障害（FIS）

※ 別途実装予定

## 得点計算

- 基本点: 100点（Stage 2は150点）
- 時間減衰: 経過分 × 0.5%（最大50%減）
- 誤答ペナルティ: 5点/回
- 最低得点: 10点

## トラブルシューティング

### Podが起動しない

```bash
# SSM経由で確認
aws ssm send-command \
  --instance-ids <INSTANCE_ID> \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo -u ec2-user kubectl describe pod <POD_NAME> -n <NAMESPACE>"]}'
  --region ap-northeast-1
```

### flagdがPendingのまま

`local-path` StorageClassが存在しない場合に発生。deploy-teams.shが自動作成しますが、手動で作成する場合：

```bash
kubectl get sc  # standardが存在することを確認
PROVISIONER=$(kubectl get sc standard -o jsonpath='{.provisioner}')
kubectl create -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-path
provisioner: ${PROVISIONER}
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
EOF
```

### Splunkにテレメトリが届かない

```bash
kubectl get pods -n splunk-monitoring
kubectl logs -n splunk-monitoring -l app=splunk-otel-collector
```

### Feature Flagsが動作しない

```bash
kubectl logs -n <NAMESPACE> deployment/flagd
```

### fraud-detectionがInit状態のまま

SQL ServerのInit処理に時間がかかる場合があります。`sql-server-fraud-0` PodがRunningになるまで待ってください。
