# o11y Game Day構想

## コンセプト

実際に障害のあるアプリケーションの計装から、事前知識ほぼ無しの状態でo11yを用いたトラブルシューティングを行うチャレンジゲームをアカウントチームから顧客へ提供する。
顧客(以下ゲーム参加者)は、提示された環境で発生している障害を、Splunk Observabitlity Cloud利用して原因特定を行う。

ゲーム参加者は、チームごとに割り当てられた回答ページを用いて、原因と思われる内容を入力し、正解することで得点を得る。一定時間経過後にチーム間で進行状況の比較を行う。

## 必要な準備

- ユーザーが触れるサンプルアプリケーション
- O11y Cloud Trial Account
- 回答とその収集・スコア管理を行うシンプルなシステム

## 計画

### ゲームの進め方

1. サンプルアプリに含まれているFeature Flagsをいくつか変更しておき、複数のアプリサービスで障害を起こしておく
2. 参加者は、チームのダッシュボードにアクセスして、マイクロサービスごとに設定されている問題に解答を入力する
   - この時、解答はあてずっぽうで当てられないように自由入力欄とする。計装内容と、observability cloudの表示から読み取れる関数名や処理名・外部API名の文字列が有力
   - 障害の発生していないマイクロサービスの解答欄に間違って入力・送信すると得点は（少ないが）減算される
   - 開始時間から起算して、早く回答するほど得点が多く得られる
3. アプリケーションの問題を解き終わったら、Stage2としてFISが起動してインフラストラクチャー障害が起き、解答欄も追加される

### サンプルアプリケーション

[OpenTelemetryデモアプリ](https://github.com/signalfx/opentelemetry-demo/tree/main/splunk)を利用。

オリジナルDoc: <https://opentelemetry.io/docs/demo/>

Splunkバージョン用デプロイ手順(Docker版): <https://lantern.splunk.com/Observability_Use_Cases/Optimize_Costs/Setting_up_the_OpenTelemetry_Demo_in_Docker>

### エラー実装

- アプリ：[Feature Flags](https://opentelemetry.io/docs/demo/feature-flags/)でエラーを仕込める
- AWS [Fault Injection](https://aws.amazon.com/jp/fis/)で障害を発生させる

## デプロイ

EKS Clusterに複数のnamespace（チームごと）としてデプロイする

### 考慮事項

- 運営側は、専用のダッシュボード画面で進捗を確認できる。
- 運営側ページ、各チームページともに認証認可は設定せず、紳士協定でアクセスしないことを前提として実装する
  - 社外秘の情報は無いため、ポリシー上は問題ない
  - 参加ハードルおよび実装コストを可能な限り下げる
- 立ち上げ時点でチーム数を決め、それに応じて環境をデプロイする
  - 管理画面でのチーム数や得点状況などを管理するDynamoDBもこの時点で合わせてデプロイする
  - Disposableかつ安価な構成としたいため、管理側ではRDBMSを利用しない
- インフラを壊すとまずインフラを直さないと他のシナリオを解けないという制限がかかる
  - アプリ全問クリアしたら、FISにアクセスして何か障害を起こす
    - EC2 Roleに関連ポリシーが必要
- **Splunk Cloudは配布環境に含めないため**、ログデータの送出をしなくてもCollector動作に問題がないことを検証しておく

---

## 実装ステップ計画

### ステップ1: ローカルデプロイ確認 - 完了

**目的**: Splunk Observability Cloudへのテレメトリ送信を確認

**実施内容**:
- kind Kubernetesクラスタでデモアプリ動作確認
- Splunk OTel Collectorインストール・テレメトリ送信確認
- `splunk/otelcol-config.yml`のHECエクスポーター問題修正

**コミット**: `4a1e78c fix: disable splunk_hec exporter to avoid missing token error`

**残Todo**:
- [ ] `deployment.environment`タグによるチーム識別の追加
  - OTEL_RESOURCE_ATTRIBUTESに`deployment.environment=team-XX`を追加
  - Splunk APMでEnvironmentフィルタリング可能にする

---

### ステップ2: EKSデプロイスクリプト - 完了

**目的**: チーム数分のnamespaceを一括デプロイ

**実施内容**:
- SAMテンプレートでEKSクラスタ + VPC + NodeGroup作成
- `deploy-teams.sh`でnamespace分離デプロイ
- Splunk OTel Collector自動インストール
- `cleanup-teams.sh`でnamespace削除

**コミット**:
- `05c8777 feat: add o11y Game Day infrastructure and admin app`
- `d14a7d4 fix: update cleanup script for EKS namespace deployment`

**残Todo**:
- [ ] Cleanupをデフォルト全削除に変更
  - 現在: `--delete-collector`オプションでCollector削除
  - 変更後: デフォルトで全削除、`--keep-collector`オプションでCollector残す

**構成**:
```
gameday/infra/
├── template.yaml       # EKS + VPC SAMテンプレート
├── deploy-teams.sh     # チームnamespaceデプロイ
├── cleanup-teams.sh    # クリーンアップ
└── list-teams.sh       # チーム一覧表示
```

**デプロイコマンド**:
```bash
# EKSクラスタ作成
cd gameday/infra && sam build && sam deploy --stack-name gameday-eks ...

# kubeconfigを更新
aws eks update-kubeconfig --name gameday-otel-demo --region ap-northeast-1

# チームデプロイ
./gameday/infra/deploy-teams.sh --team-count 5 --splunk-token xxx --splunk-realm jp0
```

---

### ステップ3: イベント運営WEBアプリ - 基本実装完了

**目的**: スコア管理・回答収集用のWebアプリ

**実施内容**:
- Express.js + TypeScriptアプリケーション
- DynamoDB テーブル定義（teams, answers, questions）
- チーム回答画面（team.html）
- 運営ダッシュボード（admin.html）
- ECS Fargate用Dockerfile

**構成**:
```
gameday/admin-app/
├── src/
│   ├── index.ts           # Express.jsエントリポイント
│   ├── routes/            # API routes
│   └── services/          # DynamoDB, scoring
├── public/
│   ├── team.html          # チーム回答画面
│   └── admin.html         # 運営ダッシュボード
├── template.yaml          # DynamoDB + ECS SAMテンプレート
└── Dockerfile
```

**残Todo**:
- [ ] admin-appのローカル動作確認
- [ ] ECS Fargateへのデプロイ検証
- [ ] ALB経由でのアクセス設定

---

### ステップ4: 設問・回答・得点システム - 基本実装完了

**Feature Flags と設問**:

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

**残Todo**:
- [ ] 各Feature Flagを実際に有効化してAPMでの見え方を確認
- [ ] 設問と正解キーワードの精査・調整

---

### ステップ5: Stage2（FIS）- 未着手

**目的**: アプリ全問クリア後にインフラ障害を追加

**計画内容**:
- FIS実験テンプレート作成（CPU Stress, Memory Stress, Network Latency）
- Stage2用の追加設問
- 移行条件: Stage1全問正解 または 運営手動移行

**残Todo**:
- [ ] FIS実験テンプレート作成
- [ ] Stage2設問の設計
- [ ] admin-appへのStage移行機能追加

---

## Critical Files

| ファイル | 用途 |
|---------|------|
| `splunk/docker-compose.yml` | Splunk版Docker Compose |
| `splunk/opentelemetry-demo.yaml` | Kubernetes マニフェスト |
| `splunk/otelcol-config.yml` | OTel Collector設定 |
| `src/flagd/demo.flagd.json` | Feature Flag定義 |
| `.env` | 環境変数 |

---

## タグ要件

全AWSリソースに付与:
- `splunkit_data_classification`: `public`
- `splunkit_environment_type`: `non-prd`
