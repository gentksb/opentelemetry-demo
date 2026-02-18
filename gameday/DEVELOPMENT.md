# Gameday 開発メモ

管理アプリのデプロイスクリプトやCloudFormationテンプレートに関する技術的な経緯・修正記録。

## 2026-02-18: 管理アプリ認証不能 & DynamoDBテーブル消失

### 発生した問題

1. `/admin` にパスワード `gameday2026` でログインできない
2. DynamoDB 3テーブル（teams, answers, questions）が存在しない

### 原因調査

**パスワード問題**

`update-image.sh` が CloudFormation パラメータ `AdminPassword`（`NoEcho: true`）を `describe-stacks` API で取得すると `****` が返る。それをそのまま `--parameter-overrides AdminPassword="****"` としてデプロイし、コンテナの `ADMIN_PASSWORD` 環境変数が `****` に上書きされた。

CloudFormation イベントログで 2026-02-17 に複数回の `update-image.sh` 実行を確認。

**DynamoDBテーブル消失**

CloudFormation イベントログから以下の経緯を特定：

| 時刻 (UTC) | 出来事 |
|-----------|--------|
| 2026-02-09T02:16 | 初回デプロイ（`--create-dynamodb` 付き）→ `CreateDynamoDB=true` → テーブル3つ作成 |
| 2026-02-16T23:42 | スタック更新で `CreateDynamoDB=false` が渡された |
| 2026-02-16T23:53 | CF `CLEANUP_IN_PROGRESS` フェーズで Condition が false になりテーブル3つが削除 |

`template.yaml` の `Condition: ShouldCreateDynamoDB` が `false` に変わると、DynamoDB リソースが CF 管理から外れクリーンアップ（物理削除）される。`DeletionPolicy: Retain` が設定されていなかったため、テーブルとデータが完全に消失した。

### 実施した修正

#### `update-image.sh` — NoEcho パラメータの安全な処理

`AdminPassword` を `UsePreviousValue=true` に変更し、再デプロイ時にパスワードが `****` で上書きされることを防止。

```diff
-        AdminPassword="$(get_param AdminPassword)" \
+        "ParameterKey=AdminPassword,UsePreviousValue=true" \
```

#### `deploy-admin.sh` — 既存スタック更新時のパラメータ引き継ぎ

既存スタックがある場合のスタック更新ロジックを追加：

- `CreateDynamoDB`: 前回 `true` なら `--create-dynamodb` 省略時も `true` を引き継ぐ
- `AdminPassword`: `--admin-password` 未指定なら `UsePreviousValue=true` で保持

#### `template.yaml` — DeletionPolicy: Retain

DynamoDB 3テーブルに `DeletionPolicy: Retain` を追加。Condition が `false` に変わっても物理テーブルが削除されないようにした。

#### DynamoDBテーブルの再作成

手動で AWS CLI から3テーブルを作成（CF 管理外）：

```bash
aws dynamodb create-table --table-name gameday-teams-dev ...
aws dynamodb create-table --table-name gameday-answers-dev ...
aws dynamodb create-table --table-name gameday-questions-dev ...
```

#### CF スタックの再デプロイ

`AdminPassword=gameday2026` を明示指定して CF スタックを更新。
