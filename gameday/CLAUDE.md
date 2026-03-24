# Splunk o11y Gameday

## コンセプト

実際に障害のあるアプリケーションの計装から、事前知識ほぼ無しの状態でo11yを用いたトラブルシューティングを行うチャレンジゲームをアカウントチームから顧客へ提供する。
顧客(以下ゲーム参加者)は、提示された環境で発生している障害を、Splunk Observabitlity Cloud利用して原因特定を行う。

ゲーム参加者は、チームごとに割り当てられた回答ページを用いて、原因と思われる内容を入力し、正解することで得点を得る。一定時間経過後にチーム間で進行状況の比較を行う。

## 技術スタック

- **リポジトリ**: gentksb/opentelemetry-demo（Cfnパラメータ `GitRepoUrl` で変更可能）
- **インフラ**: kind on AWS EC2（CloudFormationで構築）
- **IaC**: AWS CloudFormation
- **管理アプリ**: Hono(Backend) + Vite/Preact(Frontend) + DynamoDB
- **リージョン**: ap-northeast-1 (東京)

## ローカルkind開発

### セットアップ（初回）

前提ツール: docker, kubectl, kind, helm

```bash
# kindクラスタ作成（EC2と同一設定）
kind create cluster --name gameday-local \
  --config gameday/infra/kind-config.yaml

# Gamedayアプリデプロイ（Splunkトークンが必要）
bash gameday/infra/deploy-teams.sh \
  --splunk-token <TOKEN> \
  --rum-token <RUM_TOKEN> \
  --cluster-name gameday-local \
  --enable-flags

# アクセス確認
# ショップ:     http://localhost:8080
# Feature Flag: http://localhost:8080/feature/

# クラスタ削除
kind delete cluster --name gameday-local
```

### Manifestバージョン検証フロー

新しいManifestバージョンを本番（EC2）に適用する前の確認手順：

**Step 1: ローカルkindで検証**

```bash
kind create cluster --name verify-manifest \
  --config gameday/infra/kind-config.yaml

bash gameday/infra/deploy-teams.sh \
  --splunk-token <TOKEN> \
  --rum-token <RUM_TOKEN> \
  --cluster-name verify-manifest \
  --manifest-version <新VERSION> \
  --enable-flags
```

確認事項：
- `http://localhost:8080` でショップが表示されること
- Feature Flags（cartFailure, adHighCpu等）が有効になること
- Splunk Observability Cloud にトレース/メトリクスが届いていること
- RUM データ（Browser）が届いていること

**Step 2: deploy-teams.sh の MANIFEST_VERSION を更新してPRを作成**

```bash
# gameday/infra/deploy-teams.sh の MANIFEST_VERSION を更新
# ローカル検証クラスタを削除
kind delete cluster --name verify-manifest
```

**Step 3: EC2デプロイと本番検証**

```bash
# EC2 + kindクラスタを構築
aws cloudformation deploy \
  --template-file gameday/infra/ec2-kind-template.yaml \
  --stack-name gameday-kind \
  --region ap-northeast-1 \
  --parameter-overrides KeyName=<KEY_PAIR> SplunkAccessToken=<TOKEN> SplunkRealm=jp0 \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags Project=o11y-gameday

# EC2セットアップ完了を確認（"Game Day setup complete" を待つ）
aws ssm start-session --target <INSTANCE_ID> --region ap-northeast-1
# sudo tail -f /var/log/user-data.log

# deploy-teams.sh を実行
bash /home/ec2-user/opentelemetry-demo/gameday/infra/deploy-teams.sh \
  --splunk-token <TOKEN> --rum-token <RUM_TOKEN> \
  --splunk-realm jp0 --cluster-name gameday-kind --enable-flags
```

確認事項：
- `http://<EC2_PUBLIC_IP>:8080` でショップが表示されること
- Splunk Observability Cloud に RUM/APM データが届いていること

**Step 4: クリーンアップ（検証後）**

```bash
aws cloudformation delete-stack --stack-name gameday-kind --region ap-northeast-1
```

## インフラデプロイ

### EC2 + kind クラスタ

CloudFormationで EC2インスタンスとkindクラスタを構築する。
UserDataがkindクラスタのセットアップ・リポジトリクローンを自動実行する（約5〜10分）。

**有効なパラメータ**: `KeyName`, `SplunkAccessToken`, `SplunkRealm`, `InstanceType`, `AllowedSSHCidr`, `GitRepoUrl`, `GitBranch`

```bash
aws cloudformation deploy \
  --template-file gameday/infra/ec2-kind-template.yaml \
  --stack-name gameday-kind \
  --region ap-northeast-1 \
  --parameter-overrides \
    KeyName=<KEY_PAIR> \
    SplunkAccessToken=<TOKEN> \
    SplunkRealm=jp0 \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags Project=o11y-gameday
```

### アプリケーションのデプロイ

EC2にSSMまたはSSHでログインし、deploy-teams.shを実行する。
リポジトリは `/home/ec2-user/opentelemetry-demo` にクローン済み。

```bash
# SSMセッション
aws ssm start-session --target <INSTANCE_ID> --region ap-northeast-1

# セッション内で実行
bash /home/ec2-user/opentelemetry-demo/gameday/infra/deploy-teams.sh \
  --splunk-token <TOKEN> \
  --rum-token <RUM_TOKEN> \
  --splunk-realm jp0 \
  --cluster-name gameday-kind \
  --enable-flags
```

### インフラの削除

```bash
# EC2 + kindクラスタの削除
aws cloudformation delete-stack --stack-name gameday-kind --region ap-northeast-1
```

## 管理アプリ

### 初回デプロイ

ローカルから実行。DynamoDB テーブルと Lambda Function URL を作成する。

```bash
cd gameday/admin-app
./deploy-admin.sh \
  --create-dynamodb \
  --cluster-name gameday-kind \
  --splunk-realm jp0 \
  --rum-token <RUM_TOKEN> \
  --admin-password <PASSWORD>
```

### イメージ更新（設問変更等）

設問定義(`src/services/scoring.ts`)を変更した後、イメージを再ビルドしてデプロイする。

```bash
cd gameday/admin-app
./update-image.sh
# オプション: --stack-name gameday-admin --region ap-northeast-1
```

### 管理アプリの削除

```bash
cd gameday/admin-app
./deploy-admin.sh --delete
```

## 設問（scoring.ts）

### 有効なフラグ

`deploy-teams.sh --enable-flags` で有効化されるフラグ:
- `cartFailure`: on
- `imageSlowLoad`: 5sec
- `adHighCpu`: on
- `paymentFailure`: 50%

### オプション設問

Q8（ThousandEyes）,Q9(Sytheticsテストによるデータ投入) , Q10(ITSI)はデフォルトでコメントアウト済み。
ITSIとThousandEyes連携を実施した場合のみ、`scoring.ts` のコメントアウトを解除して `./update-image.sh` を実行する。

## タグ運用

CloudFormationテンプレートにはプロジェクトタグ (`Project=o11y-gameday`) のみ定義しています。
組織固有のタグは `aws cloudformation deploy --tags` でスタックレベルタグとして付与してください。
管理アプリは `deploy-admin.sh --tags` で渡したタグがスタックレベルタグとして適用されます（Lambda は内部で ALB 等を作成しないため、スタックレベルタグのみで SCP 要件を満たします）。

## docs

### イベント運営者用Doc

@gameday/README.md

### デプロイ済み環境情報（Git追跡無し）

`gameday/deployed-env.md`（`.gitignore` 対象）に記録する。機密情報（パスワード等）を含む場合は git 管理しないこと。

## Gameday Admin App

`gameday/admin-app/` にあるGameday用の管理・チーム回答アプリケーション。

### 技術スタック
- **バックエンド**: Hono + TypeScript + AWS SDK (DynamoDB)
- **フロントエンド**: Preact + SWR + Vite（マルチページ: team + admin）
- **デプロイ**: Docker (マルチステージビルド) → ECR → Lambda Function URL (CloudFormation)

### ローカル開発セットアップ（初回）

```bash
# 1. 環境変数ファイルを作成（.env.example を参照）
#    gameday/admin-app/.env に以下を設定:
#      DYNAMODB_ENDPOINT=http://localhost:8000
#      AWS_REGION=ap-northeast-1
#      ADMIN_PASSWORD=admin
#      CLUSTER_NAME=gameday-kind
#      SPLUNK_REALM=jp0

# 2. DynamoDB Local を起動
cd gameday/admin-app && docker compose -f docker-compose.dev.yml up -d

# 3. DynamoDB Localにテーブルを作成（初回のみ）
cd gameday/admin-app && bash scripts/setup-dynamodb-local.sh

# 4. 依存関係インストール
cd gameday/admin-app && npm install
cd gameday/admin-app/frontend && npm install
```

### 開発サーバー起動（同時起動）

```bash
# バックエンド(:3000) + フロントエンド(:5173) を同時起動
cd gameday/admin-app && npm run dev:all
```

アクセス先：
- チーム回答ページ: http://localhost:5173/
- 管理画面: http://localhost:5173/admin
- バックエンドAPI直接: http://localhost:3000/api/...

### 開発コマンド（個別）

```bash
# バックエンドのみ
cd gameday/admin-app && npm run dev

# フロントエンドのみ（APIは localhost:3000 にプロキシ）
cd gameday/admin-app/frontend && npm run dev

# 型チェック
cd gameday/admin-app && npx tsc --noEmit
cd gameday/admin-app/frontend && npx tsc --noEmit

# ビルド・デプロイ
cd gameday/admin-app && docker build -t gameday-admin .
cd gameday/admin-app && ./update-image.sh
```