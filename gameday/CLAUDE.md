# Splunk o11y Gameday

## コンセプト

実際に障害のあるアプリケーションの計装から、事前知識ほぼ無しの状態でo11yを用いたトラブルシューティングを行うチャレンジゲームをアカウントチームから顧客へ提供する。
顧客(以下ゲーム参加者)は、提示された環境で発生している障害を、Splunk Observabitlity Cloud利用して原因特定を行う。

ゲーム参加者は、チームごとに割り当てられた回答ページを用いて、原因と思われる内容を入力し、正解することで得点を得る。一定時間経過後にチーム間で進行状況の比較を行う。

## 技術スタック

- **リポジトリ**: splunk/opentelemetry-demo（Kubernetesデプロイ専用）
- **インフラ**: kind on AWS EC2（CloudFormationで構築）
- **IaC**: AWS CloudFormation
- **管理アプリ**: Express.js(Backend) + Vite/Preact(Frontend) + DynamoDB
- **リージョン**: ap-northeast-1 (東京)

## インフラデプロイ

### EC2 + kind クラスタ

CloudFormationで EC2インスタンスとkindクラスタを構築する。
UserDataがkindクラスタのセットアップ・リポジトリクローンを自動実行する（約5〜10分）。

**有効なパラメータ**: `KeyName`, `SplunkAccessToken`, `SplunkRealm`, `InstanceType`, `AllowedSSHCidr`

```bash
aws cloudformation deploy \
  --template-file gameday/infra/ec2-kind-template.yaml \
  --stack-name gameday-kind \
  --region ap-northeast-1 \
  --parameter-overrides \
    KeyName=<KEY_PAIR> \
    SplunkAccessToken=<TOKEN> \
    SplunkRealm=jp0 \
  --capabilities CAPABILITY_NAMED_IAM
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

ローカルから実行。DynamoDBテーブルとECS Fargate サービスを作成する。

```bash
cd gameday/admin-app
./deploy-admin.sh \
  --environment dev \
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
# オプション: --stack-name gameday-admin-dev --region ap-northeast-1
```

### 管理アプリの削除

```bash
cd gameday/admin-app
./deploy-admin.sh --delete --environment dev
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

## docs

### イベント運営者用Doc

@gameday/README.md

### デプロイ済み環境情報（Git追跡無し）

@gameday/deployed-env.md
