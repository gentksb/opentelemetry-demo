# o11y Game Day構想

## コンセプト

実際に障害のあるアプリケーションの計装から、事前知識ほぼ無しの状態でo11yを用いたトラブルシューティングを行うチャレンジゲームをアカウントチームから顧客へ提供する。

顧客は、提示された環境で発生している障害を、Splunk Observabitlity CloudおよびSplunk ITSIを利用して原因特定、修正を行う。

## 必要な準備

- ユーザーが触れるサンプルアプリケーション
- O11y Cloud Trial Account
- Splunk ITSI Account
- Option: 回答とその収集方法
  - goやBunでコンパイルした（テストの中身が見えない）検証バイナリを実行するのがいいかもしれない

## 計画

### 懸念

- ITSIとobservability Cloudの事前設定
- ダッシュボード設定の有無
  - サンプルがアプリはo11yだけ前提、ITSI側のGlass Tableなど作っておく必要がある

## サンプルアプリケーション

[OpenTelemetryデモアプリ](https://github.com/signalfx/opentelemetry-demo/tree/main/splunk)を利用。

Doc: <https://opentelemetry.io/docs/demo/>

### エラー実装

- アプリ：[Feature Flags](https://opentelemetry.io/docs/demo/feature-flags/)でエラーを仕込める
- AWS [Fault Injection](https://aws.amazon.com/jp/fis/)で障害を発生させる

## デプロイ

適当なEC2 Imageとして参加チーム分複数起動＋userdataでアプリ起動

### 考慮事項

- インフラ・アプリレイヤー共に、修正をデプロイして正常化を確認できる＝デプロイ環境へのアクセス許可が必要
  - k8sではなくVM＋SSHで `docker compose up` で全部立ち上げるのがよさそう
  - SSHやHTTPSによるサンプルアプリアクセスはあらかじめセキュリティグループで定義しておく
- Feature Flagがコード内にあるとバレバレなので、固定値に変更しておく必要がある
- インフラを壊すとまずインフラを直さないと他のシナリオを解けないという制限がかかる
  - AWSアカウント内の権限渡していいんだっけ？ダメでは？→インフラは最後の問題として原因特定までとする
  - アプリ全問クリアしたら、FISにアクセスして何か障害を起こす
    - EC2 Roleに関連ポリシーが必要
