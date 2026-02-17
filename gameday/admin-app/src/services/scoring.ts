import { docClient, TABLES, GetCommand, QueryCommand, UpdateCommand } from './dynamodb';

export interface Question {
  question_id: string;
  flag_name: string;
  service: string;
  question_text: string;
  answer_keywords: string[];
  base_points: number;
  stage: number; // 1 = App failures
  hint: string; // O11yツールでの調査ヒント
  explanation: string; // 正解後の解説
}

export interface Answer {
  team_id: string;
  question_id: string;
  answer_text: string;
  is_correct: boolean;
  points_awarded: number;
  attempt_count: number;
  answered_at: string;
  time_elapsed_minutes: number;
}

export interface TeamScore {
  team_id: string;
  total_score: number;
  questions_answered: number;
  questions_correct: number;
  current_stage: number;
  started_at: string;
  last_activity: string;
}

// 全10問を同時出題。フラグ切替なしの単一フェーズ運用。
// 必要なFeature Flags（全て同時にON）:
//   productCatalogFailure, recommendationCacheFailure, cartFailure,
//   paymentUnreachable, kafkaQueueProblems, adHighCpu, adManualGc, imageSlowLoad
//
// flag_name = 'none' の設問はFeature Flagに依存しない基本操作問題。
export const QUESTIONS: Question[] = [
  // エラー分析: product-catalog
  {
    question_id: 'q01-product-catalog',
    flag_name: 'productCatalogFailure',
    service: 'product-catalog',
    question_text: 'product-catalogサービスでエラーが発生しています。エラースパンの app.product.id 属性の値は何ですか？',
    answer_keywords: ['oljcespc7z'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で product-catalog サービスを選択し、エラートレースを開いてください。スパンのタグ（属性）一覧から app.product.id を探してください',
    explanation: 'APM で product-catalog サービスのエラートレースを開き、GetProduct スパンのタグを確認すると app.product.id = OLJCESPC7Z が記録されています。この商品IDへのリクエスト時のみエラーが発生します。',
  },
  // 基本操作: Service Map
  {
    question_id: 'q02-service-map',
    flag_name: 'none',
    service: 'checkout',
    question_text:
      'APMのService Mapを確認してください。checkoutサービスから非同期メッセージ（Kafka）を受信しているコンシューマーサービスは2つあります。そのうちの1つのサービス名を答えてください。',
    answer_keywords: ['accounting', 'fraud-detection', 'frauddetection', 'fraud'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Service Map で checkout サービスのノードを確認し、Kafkaを経由して接続しているサービスを探してください',
    explanation:
      'Service Map で checkout ノードから Kafka を経由した先を確認すると、accounting サービスと fraud-detection サービスの2つのコンシューマーが orders トピックからメッセージを受信していることが確認できます。',
  },
  {
    question_id: 'q03-recommendation-cache',
    flag_name: 'recommendationCacheFailure',
    service: 'recommendation',
    question_text: 'recommendationサービスのスパンで app.products.count の値が異常に大きくなっています。同じスパンの app.recommendation.cache_enabled 属性の値は何ですか？',
    answer_keywords: ['true'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で recommendation サービスを選択し、トレースのスパンタグを確認してください。app.recommendation.cache_enabled 属性を探してください',
    explanation: 'recommendation サービスのトレースで、スパンタグ app.recommendation.cache_enabled = true が確認できます。キャッシュ機能が有効ですが、キャッシュリークにより app.products.count が異常に増加しています。',
  },

  // 基本操作: トレース属性
  {
    question_id: 'q04-trace-protocol',
    flag_name: 'none',
    service: 'currency',
    question_text:
      'APM で currency サービスのトレースを開いてください。GetSupportedCurrencies スパンに記録されている rpc.system 属性の値は何ですか？',
    answer_keywords: ['grpc'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で currency サービスを選択し、トレースを開いてください。GetSupportedCurrencies スパンをクリックし、タグ（属性）の中から rpc.system を探してください',
    explanation:
      'currency サービスは gRPC で通信しており、GetSupportedCurrencies スパンの rpc.system 属性には「grpc」と記録されています。OpenTelemetryのセマンティック規約に基づき、RPCフレームワークの種類がこの属性に自動的に記録されます。',
  },
  {
    question_id: 'q05-cart-failure',
    flag_name: 'cartFailure',
    service: 'cart',
    question_text: 'cartサービスのEmptyCart操作でエラーが発生しています。例外メッセージによると、接続に失敗しているストレージの種類は何ですか？',
    answer_keywords: ['redis', 'valkey'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で cart サービスを選択し、EmptyCart のエラートレースを開いてください。例外メッセージ（exception.message）を読み、接続先のストレージ種類を特定してください',
    explanation: 'cart サービスのエラートレースで EmptyCart スパンの exception.message に "Wasn\'t able to connect to redis" と記載されています。cartFailure フラグにより不正なホストの Redis（Valkey）への接続が試みられ失敗しています。',
  },

  // エラー分析: checkout → payment 接続障害
  {
    question_id: 'q06-payment-unreachable',
    flag_name: 'paymentUnreachable',
    service: 'checkout',
    question_text:
      'checkoutサービスのPlaceOrder操作でpaymentサービスへの接続が失敗しています。エラートレースのスパンのエラーメッセージ（exception.message）に含まれている、接続先の不正なホスト名は何ですか？',
    answer_keywords: ['badaddress', 'badAddress'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で checkout サービスを選択し、PlaceOrder のエラートレースを開いてください。chargeCard 関連のスパンでエラーメッセージを読み、接続先のホスト名を特定してください',
    explanation:
      'checkout サービスのエラートレースを開くと、PlaceOrder スパン内でpaymentサービスへのgRPC呼び出しが失敗しています。エラーメッセージに「lookup badAddress: no such host」と記載されており、不正なアドレス badAddress:50051 への接続が試みられていることがわかります。',
  },

  // エラー分析: Kafkaメッセージング
  {
    question_id: 'q07-kafka-queue',
    flag_name: 'kafkaQueueProblems',
    service: 'checkout',
    question_text:
      'checkoutサービスで注文処理後にメッセージキューへの送信を確認してください。APMのトレースで、メッセージ送信スパンの peer.service 属性に表示されているメッセージングシステム名は何ですか？',
    answer_keywords: ['kafka'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で checkout サービスを選択し、PlaceOrder のトレースを開いてください。「publish」を含むスパンを探し、peer.service タグを確認してください',
    explanation:
      'checkout サービスのトレースで、「orders publish」スパンの peer.service 属性に「kafka」と記録されています。注文処理後、checkout サービスは Kafka の orders トピックにメッセージを送信しており、kafkaQueueProblems フラグにより大量の追加メッセージが送信されレイテンシが増加しています。',
  },

  // Runtime Metrics: CPU負荷
  {
    question_id: 'q08-ad-high-cpu',
    flag_name: 'adHighCpu',
    service: 'ad',
    question_text:
      'adサービスの getAds 操作のレイテンシが異常に高くなっています（数秒レベル）。しかし、adサービスのエラー率は0%です。エラーなしでレイテンシだけが増加する原因を調べるため、APMの Runtime Metrics を確認してください。最も異常値を示しているリソースの種類は何ですか？（CPU / Memory / GC のいずれか）',
    answer_keywords: ['cpu', 'CPU'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で ad サービスを選択し、右側の「Runtime Metrics」タブをクリックしてください。CPU、Memory、GC の各メトリクスグラフを確認し、異常な値を示しているものを特定してください',
    explanation:
      'ad サービスの Runtime Metrics を確認すると、CPU使用率（process.runtime.jvm.cpu.utilization）が異常に高い値を示しています。adHighCpu フラグにより4つのCPU負荷スレッドが起動し、タイトループでCPUを消費しています。エラーは発生しませんが、CPU競合によりレスポンスタイムが大幅に増加しています。',
  },

  // フロントエンド: 画像遅延（要ブラウザ）
  {
    question_id: 'q10-image-slow-load',
    flag_name: 'imageSlowLoad',
    service: 'frontend',
    question_text:
      'ショップのWebサイトで商品画像の表示が極端に遅くなっています。ブラウザの開発者ツール（DevTools）のNetworkタブで商品画像のリクエストを確認してください。画像リクエストのRequest Headersに追加されている、Envoyプロキシの遅延制御用HTTPヘッダー名は何ですか？（※この設問はブラウザでショップにアクセスして確認してください）',
    answer_keywords: ['x-envoy-fault-delay-request', 'envoy-fault-delay', 'fault-delay-request'],
    base_points: 100,
    stage: 1,
    hint: 'ブラウザでショップ（フロントエンド）にアクセスし、F12キーで開発者ツールを開いてください。Networkタブで画像ファイル（.jpg）のリクエストを選択し、Request Headers を確認してください。x- で始まるカスタムヘッダーを探してください',
    explanation:
      'ブラウザの開発者ツール（DevTools）のNetworkタブで商品画像リクエストを確認すると、Request Headers に x-envoy-fault-delay-request: 5000 が追加されています。フロントエンドの JavaScript が Feature Flag の値を読み取り、画像リクエスト時にこのヘッダーを付与しています。Envoy プロキシ（frontend-proxy）がこのヘッダーを認識し、指定ミリ秒の遅延を挿入しています。',
  },

  // Runtime Metrics: GC
  {
    question_id: 'q09-ad-manual-gc',
    flag_name: 'adManualGc',
    service: 'ad',
    question_text:
      'adサービスの Runtime Metrics を確認してください。JVMの自動メモリ管理に関連するメトリクスが急増しています。このメトリクス（jvm.xx.duration）の「xx」に入るキーワードは何ですか？',
    answer_keywords: ['gc', 'GC', 'garbage'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で ad サービスを選択し、Runtime Metrics を確認してください。Memory や GC 関連のグラフを見て、異常なスパイクを示しているメトリクスを特定してください',
    explanation:
      'ad サービスの Runtime Metrics を確認すると、GC Duration（jvm.gc.duration）が大幅に増加しています。adManualGc フラグにより手動でガベージコレクションが繰り返しトリガーされ、Stop-The-World 停止が発生しています。ヒープ使用率も90%近くまで上昇してからGCで回収されるパターンが確認できます。',
  },
];

/**
 * Calculate score based on time elapsed and attempt count
 */
export function calculateScore(
  basePoints: number,
  timeElapsedMinutes: number,
  attemptCount: number
): number {
  // Time decay: 0.5% reduction per minute (max 50% reduction)
  const timeDecay = Math.min(0.5, timeElapsedMinutes * 0.005);

  // Wrong answer penalty: 5 points per wrong attempt
  const wrongAttemptPenalty = (attemptCount - 1) * 5;

  // Calculate final score
  const timeAdjustedScore = basePoints * (1 - timeDecay);
  const finalScore = Math.max(10, Math.floor(timeAdjustedScore - wrongAttemptPenalty));

  return finalScore;
}

/**
 * Check if the answer matches any of the keywords (case-insensitive)
 */
export function checkAnswer(answerText: string, keywords: string[]): boolean {
  const normalizedAnswer = answerText.toLowerCase().trim();

  return keywords.some((keyword) => {
    const normalizedKeyword = keyword.toLowerCase();
    // Check for exact match or if answer contains the keyword
    return normalizedAnswer === normalizedKeyword || normalizedAnswer.includes(normalizedKeyword);
  });
}

/**
 * Get question by ID
 */
export function getQuestion(questionId: string): Question | undefined {
  return QUESTIONS.find((q) => q.question_id === questionId);
}

/**
 * Get all questions for a stage
 */
export function getQuestionsForStage(stage: number): Question[] {
  return QUESTIONS.filter((q) => q.stage === stage);
}

/**
 * Get team's current progress
 */
export async function getTeamProgress(teamId: string): Promise<{
  totalScore: number;
  answeredQuestions: string[];
  correctQuestions: string[];
  currentStage: number;
}> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.ANSWERS,
        KeyConditionExpression: 'team_id = :tid',
        ExpressionAttributeValues: {
          ':tid': teamId,
        },
      })
    );

    const answers = (result.Items || []) as Answer[];

    const totalScore = answers.reduce((sum, a) => sum + (a.points_awarded || 0), 0);
    const answeredQuestions = answers.map((a) => a.question_id);
    const correctQuestions = answers.filter((a) => a.is_correct).map((a) => a.question_id);

    const currentStage = 1; // Single stage game

    return {
      totalScore,
      answeredQuestions,
      correctQuestions,
      currentStage,
    };
  } catch (error) {
    console.error('Error getting team progress:', error);
    return {
      totalScore: 0,
      answeredQuestions: [],
      correctQuestions: [],
      currentStage: 1,
    };
  }
}

/**
 * Update team's total score
 */
export async function updateTeamScore(teamId: string): Promise<void> {
  const progress = await getTeamProgress(teamId);

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.TEAMS,
      Key: { team_id: teamId },
      UpdateExpression:
        'SET total_score = :score, questions_correct = :correct, current_stage = :stage, last_activity = :now',
      ExpressionAttributeValues: {
        ':score': progress.totalScore,
        ':correct': progress.correctQuestions.length,
        ':stage': progress.currentStage,
        ':now': new Date().toISOString(),
      },
    })
  );
}
