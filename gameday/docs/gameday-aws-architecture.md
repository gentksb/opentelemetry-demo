# Gameday アーキテクチャ図 解説

## 概要

Gameday で使用する 2 つのアプリケーション（OpenTelemetry Demo アプリ と Gameday 管理アプリ）の AWS アーキテクチャを示す図です。EC2 上の kind クラスタで動作するデモアプリが OpenTelemetry を通じて Splunk Observability Cloud にテレメトリを送信し、Splunk Cloud (ITSI) と連携する全体像を表しています。

---

## コンポーネント一覧

| コンポーネント | 種別 | 役割 |
|---|---|---|
| チーム参加者 | 外部ユーザー | Gameday 参加チーム。管理アプリへのアクセスと Splunk ダッシュボードの確認を行う |
| ALB (Application Load Balancer) | AWS ネットワーキング | インターネットからの HTTPS トラフィックを ECS タスクへルーティング |
| ECS | AWS コンテナ | 管理アプリのコンテナオーケストレーションサービス |
| Fargate | AWS コンテナ | ECS タスクを実行するサーバーレスコンピューティングプラットフォーム |
| DynamoDB | AWS データベース | チーム情報・回答・スコアを格納する NoSQL データベース |
| EC2 インスタンス | AWS コンピューティング | kind クラスタのホスト。Kubernetes ノードとして動作する |
| kind クラスタ | Kubernetes (EC2 内) | Docker 上で動作する軽量 Kubernetes クラスタ |
| OTel Demo マイクロサービス (14 Pods) | アプリケーション | frontend/cart/checkout/payment/product/shipping など多言語マイクロサービス群 |
| OTel Collector | OpenTelemetry | 各サービスからテレメトリを収集し Splunk へ転送するコレクター |
| Splunk Observability Cloud | 外部 SaaS | APM トレース・メトリクス・ログの可視化と分析プラットフォーム |
| Splunk Cloud (ITSI) | 外部 SaaS | IT サービスインテリジェンス。Observability Cloud と連携し KPI・エピソードを管理 |

---

## データフロー

### フロー A：Gameday 管理アプリ

1. **チーム参加者** がブラウザから管理アプリ URL (HTTPS) にアクセス
2. **ALB** がリクエストを受け取り、プライベートサブネットの ECS タスクへルーティング
3. **ECS / Fargate** がアプリコンテナを起動・実行（Express + TypeScript バックエンド + Preact フロントエンド）
4. **Fargate ↔ DynamoDB** がチームデータ（スコア、回答、設問進捗など）を読み書き

### フロー B：OTel Demo テレメトリ

1. EC2 インスタンス上の **kind クラスタ** で 14 個のマイクロサービス Pod が稼働
2. 各 Pod が **OpenTelemetry SDK** を使ってトレース・メトリクス・ログを生成
3. **OTel Collector** がテレメトリを収集・加工し、OTLP プロトコルで送信
4. **Splunk Observability Cloud** がトレース (APM)・メトリクス・ログを受信・可視化

### フロー C：Splunk 連携

1. **Splunk Observability Cloud** のアラートや KPI データが **Splunk Cloud (ITSI)** と連携
2. ITSI がサービスの健全性スコアやエピソードとして集約・管理

### フロー D：ダッシュボード確認

- **チーム参加者** が Splunk Observability Cloud のダッシュボードに直接アクセスし、デモアプリのトレース・メトリクスを確認（Gameday の設問に回答するため）

---

## 主なアーキテクチャ上の選択

| 選択 | 理由 |
|---|---|
| EC2 + kind (Kubernetes) | クラウドマネージド EKS を使わずに軽量なシングルノード k8s を実現。インスタンス 1 台でデモ環境を完結させコストを抑える |
| ECS / Fargate (管理アプリ) | サーバー管理不要のサーバーレスコンテナ。Gameday イベント時のみスケールアップが可能 |
| DynamoDB | サーバーレスでスケーラブルな NoSQL。チームスコアや回答データの低レイテンシ読み書きに適している |
| OTel Collector (エージェント方式) | 各サービスを Splunk に直接結合させずに済む。バックエンド変更時もコレクター設定の変更だけで対応可能 |
| Splunk Observability Cloud | OpenTelemetry ネイティブ対応の商用 APM。Gameday の設問の答えとなる可観測性データを提供する |

---

## 補足

- OTel Demo の 14 サービスは Go / Python / Java / Node.js / Rust / C# / Ruby / PHP / Kotlin など多言語で実装されており、各言語の OpenTelemetry 計装を示すデモとして使用
- 管理アプリの Docker イメージは ECR に保存され、CloudFormation でデプロイされる（図では省略）
- Gameday 参加者はチーム画面 (`/team`) から回答を送信し、管理者は管理画面 (`/admin`) でスコアや設問を管理する
