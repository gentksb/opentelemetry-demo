## プロジェクト概要

OpenTelemetry Demo（Astronomy Shop）のSplunkフォーク。ポリグロットなマイクロサービスECアプリケーションでOpenTelemetry計装を実演しています。`/splunk`ディレクトリのカスタマイズにより、デフォルトの可観測性バックエンド（Jaeger、Prometheus、Grafana）をSplunk Observability Cloudに置き換えています。

## 主要コマンド

### docker開始コマンド

```
make start
```
その他のコマンドや`docker-compose`の実行を知りたい場合、[dockerデプロイ用ドキュメント](https://opentelemetry.io/docs/demo/docker-deployment/)を確認してください

### kubernetes開始コマンド

[K8sデプロイ用ドキュメント](https://opentelemetry.io/docs/demo/kubernetes-deployment/)を参照し、最新版を確認してください。

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
| gameday-admin (backend) | TypeScript | Hono/AWS SDK |
| gameday-admin (frontend) | TypeScript | Preact/SWR/Vite |


## 環境変数, Feature Flags, テストとテレメトリの確認

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
