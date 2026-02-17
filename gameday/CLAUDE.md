# Gameday CLAUDE.md

## インフラデプロイ

### EC2 + kind クラスタ

EC2インスタンス上にkindクラスタを構築し、OpenTelemetry Demoをデプロイする。

```bash
# EC2 + kindクラスタのデプロイ
aws cloudformation deploy \
  --template-file gameday/infra/ec2-kind-template.yaml \
  --stack-name gameday-kind \
  --region ap-northeast-1 \
  --parameter-overrides \
    KeyPairName=<KEY_PAIR> \
    ClusterName=gameday-kind \
    GitBranch=<BRANCH_NAME> \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags splunkit_data_classification=public splunkit_environment_type=non-prd

# EC2のIPアドレスを取得
aws cloudformation describe-stacks --stack-name gameday-kind \
  --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" --output text
```

### チームnamespace のデプロイ

EC2インスタンスにSSM経由でコマンドを実行し、チームnamespaceをデプロイする。

```bash
# チームnamespaceのデプロイ（SSM経由）
INSTANCE_ID=<INSTANCE_ID>
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo -u ec2-user bash /home/ec2-user/opentelemetry-demo/gameday/infra/deploy-teams.sh --team-count 5 --splunk-token <TOKEN> --splunk-realm jp0 --cluster-name gameday-kind"]}' \
  --region ap-northeast-1
```

### インフラの削除

```bash
# チームnamespace削除（SSM経由）
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo -u ec2-user bash /home/ec2-user/opentelemetry-demo/gameday/infra/cleanup-teams.sh"]}' \
  --region ap-northeast-1

# EC2 + kindクラスタの削除
aws cloudformation delete-stack --stack-name gameday-kind --region ap-northeast-1
```

## 管理アプリ

### 初回デプロイ

DynamoDBテーブルとECS Express Modeサービスを作成する。

```bash
cd gameday/admin-app
./deploy-admin.sh \
  --environment dev \
  --create-dynamodb \
  --cluster-name gameday-kind \
  --splunk-realm jp0 \
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

## 現在のデプロイ済み環境

`gameday/deployed-env.md` を参照。
