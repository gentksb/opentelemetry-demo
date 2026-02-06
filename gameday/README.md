# o11y Game Day

Splunk Observability Cloudを使用したトラブルシューティングチャレンジゲームの実装。

## 概要

OpenTelemetry DemoアプリケーションにFeature Flagsで障害を注入し、参加チームがSplunk APM/Infrastructureを使用して原因を特定するゲームです。

## 構成

```
gameday/
├── infra/                    # EKSインフラとデプロイスクリプト
│   ├── template.yaml         # EKSクラスタ用CloudFormationテンプレート
│   ├── deploy-teams.sh       # チームデプロイスクリプト
│   ├── cleanup-teams.sh      # リソースクリーンアップ
│   └── list-teams.sh         # チーム一覧表示
└── admin-app/                # 運営管理アプリ
    ├── src/                  # Express.js TypeScriptソース
    ├── public/               # フロントエンドHTML
    ├── template.yaml         # DynamoDB/ECS用CloudFormationテンプレート
    └── Dockerfile
```

## 前提条件

- AWS CLI（設定済み）
- kubectl
- Helm 3.x
- Splunk Observability Cloud アカウント

## デプロイ手順

### 1. EKSクラスタの作成（初回のみ）

```bash
aws cloudformation deploy \
  --template-file gameday/infra/template.yaml \
  --stack-name gameday-eks \
  --region ap-northeast-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ClusterName=gameday-otel-demo \
    SplunkAccessToken=<YOUR_TOKEN> \
    SplunkRealm=jp0 \
    NodeInstanceType=t3.xlarge \
    NodeGroupDesiredSize=3 \
  --tags \
    splunkit_data_classification=public \
    splunkit_environment_type=non-prd
```

クラスタ作成には約15-20分かかります。

### 2. kubeconfigの更新

```bash
aws eks update-kubeconfig --name gameday-otel-demo --region ap-northeast-1
```

### 3. チームのデプロイ

```bash
./gameday/infra/deploy-teams.sh \
  --team-count 5 \
  --splunk-token <YOUR_SPLUNK_TOKEN> \
  --splunk-realm jp0 \
  --cluster-name gameday-otel-demo
```

### 4. デプロイ確認

```bash
# チーム一覧
./gameday/infra/list-teams.sh

# Pod状態確認
kubectl get pods -n otel-demo-team-01

# フロントエンドへのアクセス
kubectl port-forward -n otel-demo-team-01 svc/frontend-proxy 8080:8080
# ブラウザで http://localhost:8080 を開く
```

### 5. Splunk Observability Cloudで確認

1. https://app.<REALM>.signalfx.com にアクセス
2. APM → Explore でサービスマップを確認
3. `team.id` でフィルタリング可能

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

### EKSクラスタの削除

```bash
aws cloudformation delete-stack --stack-name gameday-eks --region ap-northeast-1
```

## ゲーム設問

### Stage 1: アプリケーション障害（Feature Flags）

| Flag | サービス | 設問 |
|------|----------|------|
| adFailure | ad | GetAds RPCが失敗する原因のメソッド名は？ |
| adManualGc | ad | 手動GCをトリガーするクラス名は？ |
| cartFailure | cart | Cart操作失敗の原因となるストア名は？ |
| productCatalogFailure | product-catalog | エラーとなる商品IDは？ |
| paymentFailure | payment | 支払いが失敗するユーザー属性は？ |
| paymentUnreachable | checkout | 到達不能な支払いサービスのアドレスは？ |
| recommendationCacheFailure | recommendation | 問題を引き起こしているキャッシュ機能名は？ |
| emailMemoryLeak | email | メモリリークの原因となっている処理/変数名は？ |
| imageSlowLoad | frontend | 画像遅延を引き起こすHTTPヘッダー名は？ |
| kafkaQueueProblems | kafka | キュー問題の原因となっているコンポーネントは？ |

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
kubectl describe pod <POD_NAME> -n <NAMESPACE>
kubectl logs <POD_NAME> -n <NAMESPACE>
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
