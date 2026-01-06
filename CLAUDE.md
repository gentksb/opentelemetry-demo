# CLAUDE.md

このファイルはClaude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

OpenTelemetry Demo（Astronomy Shop）のSplunkフォーク。ポリグロットなマイクロサービスECアプリケーションでOpenTelemetry計装を実演しています。`/splunk`ディレクトリのカスタマイズにより、デフォルトの可観測性バックエンド（Jaeger、Prometheus、Grafana）をSplunk Observability Cloudに置き換えています。

## 主要コマンド

### デモの実行
```bash
make start                    # 全サービス起動（UI: http://localhost:8080）
make start-minimal            # 可観測性バックエンドなしで起動
make stop                     # 全サービス停止
make restart service=frontend # 単一サービスの再起動
make redeploy service=frontend # サービスの再ビルドと再起動
```

### ビルド
```bash
make build                    # 全Dockerイメージをビルド
make build-multiplatform      # linux/amd64とlinux/arm64向けにビルド
```

### テスト
```bash
make run-tests                           # 全テスト実行（フロントエンド + トレースベース）
make run-tracetesting                    # トレースベーステストのみ実行
make run-tracetesting SERVICES_TO_TEST="ad payment"  # 特定サービスのテスト
```

### リント・検証
```bash
make check                    # 全チェック実行（スペル、markdown、ライセンス、リンク）
make misspell                 # markdownファイルのスペルチェック
make yamllint                 # YAMLファイルのリント
make checklicense             # ライセンスヘッダーの検証
```

### Protobuf生成
```bash
make docker-generate-protobuf  # 全サービスのprotobufファイルを再生成
./docker-gen-proto.sh go checkout  # 特定の言語/サービス向けに生成
```

## アーキテクチャ

### サービスと使用言語
| サービス | 言語 | フレームワーク |
|---------|----------|-----------|
| frontend | TypeScript | Next.js |
| cart | C# | .NET/gRPC |
| checkout | Go | gRPC |
| product-catalog | Go | gRPC |
| currency | C++ | gRPC |
| payment | JavaScript | Node.js/gRPC |
| shipping | Rust | tonic/gRPC |
| email | Ruby | Sinatra |
| ad | Java | Spring |
| recommendation | Python | gRPC |
| quote | PHP | Slim |
| fraud-detection | Kotlin | Kafkaコンシューマー |
| accounting | C# | .NET/Kafka |
| load-generator | Python | Locust |

### 主要コンポーネント
- **pb/demo.proto**: 全gRPCサービスのprotobuf定義
- **src/otel-collector/otelcol-config.yml**: OpenTelemetry Collectorパイプライン設定
- **src/flagd/**: エラー注入シナリオ用のフィーチャーフラグ定義
- **.env**: 環境変数とサービス設定
- **.env.override**: ローカルオーバーライド（コミット対象外）

### 通信パターン
- サービス間はgRPCで通信（`pb/demo.proto`で定義）
- Kafkaで非同期イベント送信（checkout → accounting、checkout → fraud-detection）
- フロントエンドプロキシ（Envoy）が外部トラフィックをルーティング

### Splunkフォークのメンテナンス
上流の変更を同期後、`./splunk/update-demos.sh`を実行して更新:
- `splunk/docker-compose.yml` - Splunk OTel Collectorを使用する変更版composeファイル
- `splunk/opentelemetry-demo.yaml` - 変更版Kubernetesマニフェスト

YAML処理に`yq`が必要です。

## 開発のヒント

### 環境設定
- `.env.override`テンプレートから設定をコピー
- 実際のLLM連携には`LLM_BASE_URL`、`LLM_MODEL`、`OPENAI_API_KEY`を設定

### フィーチャーフラグ
http://localhost:8080/feature/ でフォールト注入シナリオを有効化:
- `adServiceFailure` - 広告サービスエラー
- `cartServiceFailure` - カートサービスエラー
- `productCatalogFailure` - 商品カタログエラー

### サービス別テスト
個別サービスのテストは`test/tracetesting/<service>/`にあります。特定のテストを実行:
```bash
docker compose run traceBasedTests "cart payment"
```

### テレメトリの確認
- Jaeger UI: http://localhost:8080/jaeger/ui
- Grafana: http://localhost:8080/grafana/
- 負荷生成ツール: http://localhost:8080/loadgen/
