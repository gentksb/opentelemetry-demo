import { docClient, TABLES, GetCommand, QueryCommand, UpdateCommand } from './dynamodb';

export interface Question {
  question_id: string;
  flag_name: string;
  service: string;
  trigger_type: 'customer' | 'colleague' | 'alert'; // シナリオの起点
  difficulty: 'normal' | 'hard'; // 難易度
  scenario: string; // SREロールプレイのシチュエーション説明
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

// 全8問を同時出題。フラグ切替なしの単一フェーズ運用。
// 必要なFeature Flags（全て同時にON）:
//   productCatalogFailure, cartFailure, imageSlowLoad, adHighCpu, paymentServiceFailure(default 50%)
//
// flag_name = 'none' の設問はFeature Flagに依存しない基本操作問題。
//
// 全設問は「顧客からの問い合わせ」「同僚からの相談」「システムアラート」のいずれかを
// 起点とするSREロールプレイ形式。参加者はSREチームの一員として障害対応を行う。
export const QUESTIONS: Question[] = [
  // Q1: APM Trace - エラートレースから影響商品IDを特定
  {
    question_id: 'q01-product-catalog',
    flag_name: 'productCatalogFailure',
    service: 'product-catalog',
    trigger_type: 'customer',
    difficulty: 'normal',
    scenario: '顧客から「特定の商品ページを開くとエラーが表示される」と連絡がありました。product-catalog サービスでエラーが発生しているようです。APMでエラートレースを調査し、影響を受けている商品を特定してください。',
    question_text: 'エラーが発生しているトレースのスパンから、影響を受けている商品のID（app.product.id の値）を答えてください。',
    answer_keywords: ['oljcespc7z'],
    base_points: 100,
    stage: 1,
    hint: 'Splunk Observability Cloud にログインし、APM > Explore で product-catalog サービスを選択してください。エラーのあるトレースを開き、スパンのタグ（属性）一覧から app.product.id を探してください。',
    explanation: 'APM で product-catalog サービスのエラートレースを開き、GetProduct スパンのタグを確認すると app.product.id = OLJCESPC7Z が記録されています。この商品IDへのリクエスト時のみエラーが発生しています。実際のインシデント対応では、この情報をもとに影響範囲の特定や顧客への報告を行います。',
  },

  // Q2: APM Service Map - サービス間の依存関係を把握
  {
    question_id: 'q02-service-map',
    flag_name: 'none',
    service: 'checkout',
    trigger_type: 'colleague',
    difficulty: 'normal',
    scenario: '同僚から「checkout サービスがどのサービスに依存しているか把握したい。障害時の影響範囲を見積もるため、下流の依存関係を調べてほしい」と相談されました。',
    question_text: 'Service Map で checkout サービスの下流（outbound）依存関係を確認し、直接呼び出しているサービス名を1つ答えてください。',
    answer_keywords: ['cart', 'product-catalog', 'productcatalog', 'currency', 'shipping', 'email', 'payment', 'kafka'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Service Map を開いてください。checkout サービスのノードをクリックし、そこから矢印で接続されている下流サービスを確認してください。',
    explanation: 'Service Map で checkout の下流を確認すると、cart・product-catalog・currency・shipping・email・payment・kafka の7つのサービスへの依存関係があります。Service Map はサービス間の依存関係を俯瞰的に把握でき、障害時の影響範囲の見積もりに活用できます。',
  },

  // Q3: APM Trace - 例外メッセージからデータストア障害を特定
  {
    question_id: 'q03-cart-failure',
    flag_name: 'cartFailure',
    service: 'cart',
    trigger_type: 'customer',
    difficulty: 'hard',
    scenario: '顧客から「ショッピングカートを空にしようとするとエラーになる」と問い合わせがありました。cart サービスの EmptyCart 操作でエラーが発生しているようです。CS部門のコメントでは、エラーが発生する顧客は全体から見て僅かな割合ですが、エラーそのものは確実に発生しているそうです。',
    question_text: 'cart サービスのエラートレースを確認してください。Service Map 上で cart が接続しているデータストアのサービス名を答えてください。',
    answer_keywords: ['redis', 'valkey'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で cart サービスを選択し、Errors のフィルタでエラートレースを表示してください。エラーの原因を把握したら、Service Map に切り替えて cart サービスが接続しているデータストア（赤いノード）を確認してください。',
    explanation: 'cart サービスのエラートレースで exception.message を確認すると、Valkey（Redis互換）への接続失敗が記録されています。Service Map では cart → redis としてデータストアへの依存関係が表示されます。トレースの例外メッセージで「何が起きたか」を把握し、Service Map で「どのサービスが関係しているか」を視覚的に確認する、という2段階の調査が実際のトラブルシューティングでも有効です。',
  },

  // Q4: RUM Performance - エンドユーザー体験から遅延リソースを特定
  {
    question_id: 'q04-image-slow-rum',
    flag_name: 'imageSlowLoad',
    service: 'frontend',
    trigger_type: 'customer',
    difficulty: 'normal',
    scenario: '複数の顧客から「商品画像の表示が異常に遅い」と報告がありました。バックエンドのエラーは出ていないようです。RUM（Real User Monitoring）でエンドユーザーの実体験を確認してください。',
    question_text: 'RUM の画面で XHR/Fetch リクエストを確認し、5秒以上かかっているリクエストの URL パスに共通するキーワードを答えてください。',
    answer_keywords: ['images', '/images', 'images/products', '/images/products'],
    base_points: 100,
    stage: 1,
    hint: 'Splunk Observability Cloud > RUM を開いてください。対象のアプリケーションを選択し、Tag Spotlight や User Sessions で遅延しているリクエストの URL パターンを確認してください。画像ファイルに関連するパスを探しましょう。',
    explanation: 'RUM で確認すると、/images/products/ 配下の画像リクエストが5秒以上かかっています。RUM はバックエンドのトレースでは見えないフロントエンド側のパフォーマンス問題を可視化できます。エラーが出ていなくても、ユーザー体験が悪化していることを検知できるのが RUM の強みです。',
  },

  // Q5: RUM Tag Spotlight - ユーザー分析
  {
    question_id: 'q05-rum-user-role',
    flag_name: 'none',
    service: 'frontend',
    trigger_type: 'colleague',
    difficulty: 'normal',
    scenario: '同僚から「サイトのユーザー層を分析してほしい。どんな種類のユーザーが多いか、RUM のデータから確認できる？」と依頼されました。',
    question_text: 'RUM の Tag Spotlight で enduser.role の分布を確認し、最も割合が高いユーザーロールを答えてください。',
    answer_keywords: ['guest'],
    base_points: 100,
    stage: 1,
    hint: 'RUM > Tag Spotlight を開いてください。タグの一覧から enduser.role を探し、各ロール（Admin / Member / Guest）の割合を確認してください。',
    explanation: 'RUM の Tag Spotlight で enduser.role を確認すると、Guest が最も多い割合を占めています。RUM のタグを活用することで、ユーザーセグメント別のパフォーマンスやエラー率を分析できます。例えば特定のロールだけエラーが多い場合、権限やフロー固有の問題を疑えます。',
  },

  // Q6: Infrastructure Navigator - K8s Pod のリソース異常を特定
  {
    question_id: 'q06-infra-cpu',
    flag_name: 'adHighCpu',
    service: 'ad',
    trigger_type: 'alert',
    difficulty: 'normal',
    scenario: 'システムアラートで Kubernetes クラスタの CPU 使用率上昇が検知されました。どのワークロードがリソースを大量消費しているか、Infrastructure Navigator で調査してください。',
    question_text: 'Infrastructure Navigator の Kubernetes ビューで、最も CPU 使用率が高いワークロード（Deployment / Pod）のサービス名を答えてください。',
    answer_keywords: ['ad'],
    base_points: 100,
    stage: 1,
    hint: 'Splunk Observability Cloud > Infrastructure > Kubernetes Navigator を開いてください。Workloads または Pods のビューに切り替え、CPU 使用率でソートまたはヒートマップの色で異常値を探してください。',
    explanation: 'Infrastructure Navigator の Kubernetes ビューで確認すると、ad サービスの Pod が突出して高い CPU 使用率を示しています。Infrastructure monitoring によりアプリケーションコードを見なくても、リソース異常をインフラレベルで素早く特定できます。',
  },

  // Q7: APM Service Map - エラーの伝播経路を追跡
  {
    question_id: 'q07-checkout-error',
    flag_name: 'paymentServiceFailure',
    service: 'checkout',
    trigger_type: 'alert',
    difficulty: 'normal',
    scenario: 'システムアラートで checkout サービスのエラー率上昇が検知されました。注文処理の約半数が失敗しているようです。Service Map で checkout サービスの下流を確認し、エラーの発生元を特定してください。',
    question_text: 'Service Map で checkout サービスの下流を確認し、エラーが発生しているサービス名を答えてください。',
    answer_keywords: ['payment', 'paymentservice', 'payment-service'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Service Map を開き、checkout サービスのノードをクリックしてください。下流サービスへの接続線の色を確認し、赤く表示されている（エラーが発生している）サービスを探してください。',
    explanation: 'Service Map で checkout の下流を確認すると、payment サービスへの接続が赤く表示されエラーが発生しています。payment サービスのバグバージョン（v350.10）が約50%のリクエストで HTTP 401 エラーを返しており、外部決済ゲートウェイ（ButtercupPayments）が根本原因です。Service Map はエラーの伝播経路を視覚的に把握するのに効果的です。',
  },

  // Q8: Browser DevTools - フロントエンド遅延の原因深堀り
  {
    question_id: 'q08-envoy-header',
    flag_name: 'imageSlowLoad',
    service: 'frontend',
    trigger_type: 'customer',
    difficulty: 'hard',
    scenario: 'Q4 で画像リクエストの遅延を確認しました。顧客への根本原因の説明が必要です。ブラウザの開発者ツール（DevTools）でリクエストの詳細を調査し、遅延を引き起こしているメカニズムを特定してください。',
    question_text: 'ブラウザの DevTools > Network タブで商品画像のリクエストを確認し、Request Headers に追加されている遅延制御用 HTTP ヘッダー名を答えてください。',
    answer_keywords: ['x-envoy-fault-delay-request', 'envoy-fault-delay', 'fault-delay-request'],
    base_points: 100,
    stage: 1,
    hint: 'ブラウザでショップ（フロントエンド）にアクセスし、F12 キーで開発者ツールを開いてください。Network タブで画像ファイル（.jpg）のリクエストを選択し、Request Headers を確認してください。x- で始まるカスタムヘッダーを探してください。',
    explanation: 'DevTools の Network タブで商品画像リクエストを確認すると、Request Headers に x-envoy-fault-delay-request: 5000 が追加されています。フロントエンドの JavaScript が Feature Flag の値を読み取り、画像リクエスト時にこのヘッダーを付与しています。Envoy プロキシがこのヘッダーを認識し、指定ミリ秒の遅延を挿入しています。RUM で「遅い」ことを検知し、DevTools で「なぜ遅いか」を特定する、というのが実際の調査フローです。',
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
