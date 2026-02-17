import { docClient, TABLES, GetCommand, QueryCommand, UpdateCommand } from './dynamodb';

export interface Question {
  question_id: string;
  flag_name: string;
  service: string;
  question_text: string;
  answer_keywords: string[];
  base_points: number;
  stage: number; // 1 = App failures, 2 = FIS infrastructure
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

// Question definitions based on Feature Flags
// フラグは2グループに分けて有効化する:
//   グループA（独立系）: productCatalogFailure, adFailure, recommendationCacheFailure
//   グループB（checkout連鎖系）: paymentFailure(50%), cartFailure
// 注意: グループBを有効にする場合はproductCatalogFailureをOFFにすること
export const QUESTIONS: Question[] = [
  // Stage 1: グループA - 独立系障害
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
  {
    question_id: 'q02-ad-failure',
    flag_name: 'adFailure',
    service: 'ad',
    question_text: 'adサービスでgRPCエラーが発生しています。エラーのステータスコードは何ですか？',
    answer_keywords: ['unavailable'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で ad サービスを選択し、エラートレースを開いてください。スパンのステータスやエラーメッセージを確認してください',
    explanation: 'APM で ad サービスのエラートレースを開くと、GetAds オペレーションでステータスコード UNAVAILABLE が返されていることが確認できます。約10%の確率でランダムに発生します。',
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

  // Stage 1: グループB - checkout連鎖系障害
  {
    question_id: 'q04-payment-failure',
    flag_name: 'paymentFailure',
    service: 'payment',
    question_text: 'paymentサービスで外部決済APIの呼び出しが失敗しています。エラースパンの peer.service 属性に表示されている外部サービス名は何ですか？',
    answer_keywords: ['buttercuppayments', 'buttercup'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Explore で payment サービスを選択し、エラートレースを開いてください。外部API呼び出しのクライアントスパンで peer.service タグを探してください',
    explanation: 'payment サービスのエラートレースで、buttercup.payments.api スパンのタグに peer.service = ButtercupPayments が記録されています。外部決済サービス ButtercupPayments への呼び出しが確率的に失敗しています。',
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

  // Stage 2: FIS Infrastructure (placeholder - to be expanded)
  {
    question_id: 'q11-fis-cpu',
    flag_name: 'fis-cpu-stress',
    service: 'infrastructure',
    question_text: 'CPU使用率が急上昇しているホスト名/インスタンスIDは何ですか？',
    answer_keywords: ['stress-ng', 'stress', 'cpu'], // Update with actual hostname before event
    base_points: 150,
    stage: 2,
    hint: 'Infrastructure Monitoring > Hosts でCPU使用率が異常に高いホストを探してください',
    explanation: 'Infrastructure Monitoring の Hosts ビューで CPU 使用率が急上昇しているホストが確認できます。stress-ng プロセスが CPU ストレスを発生させています。',
  },
  {
    question_id: 'q12-fis-memory',
    flag_name: 'fis-memory-stress',
    service: 'infrastructure',
    question_text: 'メモリ使用率が急上昇しているプロセス名は何ですか？',
    answer_keywords: ['stress-ng', 'stress'],
    base_points: 150,
    stage: 2,
    hint: 'Infrastructure Monitoring > Hosts でメモリ使用率が異常なホストを特定し、Top Processes を確認してください',
    explanation: 'Infrastructure Monitoring でメモリ使用率が急上昇しているホストの Top Processes を見ると、stress-ng プロセスが大量のメモリを消費していることが確認できます。',
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

    // Determine current stage
    const stage1Questions = getQuestionsForStage(1);
    const stage1Complete = stage1Questions.every((q) => correctQuestions.includes(q.question_id));
    const currentStage = stage1Complete ? 2 : 1;

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
