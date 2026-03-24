---
name: upstream-sync
description: >
  Upstream (origin/main) の変更を tgen/o11y-gameday ブランチに安全に取り込む。
  Gamedayデプロイへの影響を並列エージェントで分析し、取り込み可否を判定してからマージを実行する。
  「upstreamを同期して」「最新化して」「mainの変更を取り込んで」「upstream sync」で起動。
---

# upstream-sync Skill

## 目的

`tgen/o11y-gameday` ブランチに対して `origin/main` の変更を定期的に取り込む運用を自動化する。
Gamedayデプロイ（deploy-teams.sh / deploy-admin.sh）への影響がないことを確認してからマージする。

## Gamedayデプロイの構成（保護対象）

| ファイル/ディレクトリ | 役割 | 変更禁止理由 |
|---|---|---|
| `gameday/infra/deploy-teams.sh` | K8sデプロイスクリプト | 本番手順の中核 |
| `gameday/admin-app/template.yaml` | Lambda CloudFormation | 本番インフラ定義 |
| `gameday/infra/ec2-kind-template.yaml` | EC2+kind環境構築 | 本番インフラ定義 |
| `kubernetes/splunk-astronomy-shop-<VERSION>.yaml` | K8sマニフェスト | deploy-teams.shが参照 |
| `gameday/` ディレクトリ全体 | Gameday実装 | origin/mainには存在しない |

`deploy-teams.sh` 内の `MANIFEST_VERSION` 変数が参照するK8sマニフェストファイルが存在することが必須。

## 実行手順

### Phase 1: 情報収集

```bash
git fetch origin
git merge-base tgen/o11y-gameday origin/main
```

### Phase 2: 並列分析（2エージェントを同時起動）

**Agent A: origin/main側の変更分析**
以下を調査してレポート：
- `git diff <merge-base>..origin/main --name-only` で変更ファイル一覧
- 変更ファイルを分類：
  - `gameday/` 含む → **影響あり（手動対応必要）**
  - `kubernetes/splunk-astronomy-shop-*.yaml` 含む → **K8sマニフェスト更新（要確認）**
  - `docker-compose.yml` / `.env` / `src/` / `splunk/` → 単純取り込み可
  - `kubernetes/old/` への移動 → 確認（rename検出に注意）
- docker-compose.yml の削除コミットがあるか確認

**Agent B: 現状のGameday依存関係確認**
以下を確認してレポート：
- `MANIFEST_VERSION` の値（deploy-teams.sh から）
- `kubernetes/splunk-astronomy-shop-<VERSION>.yaml` の存在確認
- `gameday/admin-app/template.yaml` が存在することを確認

### Phase 3: 影響判定

```
Agent Aの変更対象 ∩ Agent Bの保護ファイルリスト = 影響あり
```

- **gameday/ に変更なし** かつ **使用中K8sマニフェストに変更なし** → 「単純マージ可能」
- それ以外 → 影響内容をユーザーに報告し手動対応を依頼

### Phase 4: マージ実行（単純マージ可能の場合）

```bash
git merge --no-commit --no-ff origin/main
```

**コンフリクト解決方針:**

| ファイル | 対処 |
|---|---|
| `.gitignore` | HEAD側(Gameday設定)とorigin/main側の両方を保持 |
| その他テキスト | 内容を確認して適切にマージ |

**マージ後の必須修復（origin/mainがDocker Composeを廃止しているため）:**

```bash
# Gamedayで使用中のK8sマニフェストをgitのrename検出から保護
git checkout HEAD -- kubernetes/splunk-astronomy-shop-<MANIFEST_VERSION>.yaml

# ローカル開発用docker-composeを保持（origin/mainが削除しているが本ブランチでは維持）
git checkout HEAD -- docker-compose.yml docker-compose-tests.yml docker-compose-tests_include-override.yml docker-compose.minimal.yml
```

> ⚠️ **重要**: origin/mainのコミット `3e2f171a` でDocker Composeサポートが廃止された。
> マージ時にgitのrename検出が `kubernetes/splunk-astronomy-shop-1.5.5.yaml` を
> `kubernetes/old/` に移動しようとするため、明示的に元パスへ復元が必要。

```bash
git add .gitignore kubernetes/splunk-astronomy-shop-<MANIFEST_VERSION>.yaml \
  docker-compose.yml docker-compose-tests.yml docker-compose-tests_include-override.yml \
  docker-compose.minimal.yml
```

### Phase 5: 検証

以下を確認してから commit：

```bash
# Gameday固有ファイルが変更されていないこと
git diff HEAD -- gameday/ --name-only   # 空であること

# K8sマニフェストが元パスに存在すること
ls kubernetes/splunk-astronomy-shop-<MANIFEST_VERSION>.yaml

# deploy-teams.shの参照が正しいこと
grep "MANIFEST_VERSION" gameday/infra/deploy-teams.sh
```

### Phase 6: コミット

```bash
git commit -m "chore: mainブランチのUpstream変更を取り込み

取り込み内容の概要（Agent Aの調査結果から）:
- <変更内容サマリー>

[Gameday影響なし]
- kubernetes/splunk-astronomy-shop-<VERSION>.yaml は元パスを保持
- docker-compose.yml 等はローカル開発用として保持
- gameday/ ディレクトリは変更なし"
```

---

## 「単純マージ不可」の判定基準とその後の対応

以下の場合は**自動マージを中断**し、ユーザーに報告する：

1. `gameday/` 配下のファイルがorigin/mainで変更されている
2. `deploy-teams.sh` が参照するK8sマニフェストファイルが変更・削除されている
3. `gameday/admin-app/template.yaml` が変更されている

報告フォーマット：
```
⚠️ 単純マージ不可: 以下のGameday関連ファイルが origin/main で変更されています
- [ファイルパス]: [変更内容の概要]

手動での対応が必要です。以下を確認してください：
1. 変更内容がGamedayデプロイ手順に与える影響
2. 変更を取り込む場合の deploy-teams.sh / template.yaml の更新要否
```

---

## 定期実行の目安

- Gamedayイベント前：必ず最新mainを取り込み、新機能（K8sマニフェスト等）を確認
- 日常運用：月次程度での取り込みを推奨（dependabotのセキュリティ更新を含む）

---

## 既知の注意事項（過去の実行から学習）

1. **docker-compose廃止**: origin/main (`3e2f171a`) でDocker Composeが廃止済み。
   マージ毎にdocker-compose*.ymlを `git checkout HEAD --` で復元が必要。

2. **K8sマニフェストのrename検出**: gitが `kubernetes/*.yaml` を `kubernetes/old/*.yaml`
   へのrename と判断してしまう。`git checkout HEAD` で元パスに復元する。

3. **コンフリクトは.gitignoreのみ**: 通常 `.gitignore` だけがコンフリクトする。
   HEAD側（Gameday設定）とorigin/main側（Confluence等）を両方保持する。

4. **product-reviews / llm**: origin/mainのK8sマニフェスト(`splunk/opentelemetry-demo.yaml`)
   に未収録。docker-compose専用のため、Gameday K8s環境への追加は別タスクで対応。

5. **Splunk固有イメージ**: 現行manifest(1.5.5)は `splunk/otel-*:1.5.0` イメージを使用。
   origin/mainのK8sマニフェストはOSSイメージ(`otel/demo:2.1.3-*`)で、
   **Splunk APM/RUM計装が異なる**。K8sマニフェストを切り替える際は別途検証が必要。
