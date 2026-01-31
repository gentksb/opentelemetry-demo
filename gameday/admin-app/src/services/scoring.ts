import { docClient, TABLES, GetCommand, QueryCommand, UpdateCommand } from './dynamodb';

export interface Question {
  question_id: string;
  flag_name: string;
  service: string;
  question_text: string;
  answer_keywords: string[];
  base_points: number;
  stage: number; // 1 = App failures, 2 = FIS infrastructure
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
export const QUESTIONS: Question[] = [
  // Stage 1: Application Failures
  {
    question_id: 'q01-ad-failure',
    flag_name: 'adFailure',
    service: 'ad',
    question_text: 'GetAds RPCが失敗する原因のメソッド名は何ですか？',
    answer_keywords: ['getads', 'adservice', 'getad'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q02-ad-gc',
    flag_name: 'adManualGc',
    service: 'ad',
    question_text: '手動GCをトリガーするクラス名は何ですか？',
    answer_keywords: ['garbagecollectiontrigger', 'entry', 'adservice'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q03-cart-failure',
    flag_name: 'cartFailure',
    service: 'cart',
    question_text: 'Cart操作失敗の原因となるストア名は何ですか？',
    answer_keywords: ['_badcartstore', 'badcartstore'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q04-product-catalog',
    flag_name: 'productCatalogFailure',
    service: 'product-catalog',
    question_text: 'エラーとなる商品IDは何ですか？',
    answer_keywords: ['oljcespc7z'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q05-payment-failure',
    flag_name: 'paymentFailure',
    service: 'payment',
    question_text: '支払いが失敗するユーザー属性（membershipレベル）は何ですか？',
    answer_keywords: ['gold'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q06-payment-unreachable',
    flag_name: 'paymentUnreachable',
    service: 'checkout',
    question_text: '到達不能な支払いサービスのアドレスは何ですか？',
    answer_keywords: ['badaddress:50051', 'badaddress'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q07-recommendation-cache',
    flag_name: 'recommendationCacheFailure',
    service: 'recommendation',
    question_text: '問題を引き起こしているキャッシュ関連の機能名は何ですか？',
    answer_keywords: ['cache', 'cached_ids', 'recommendationcache'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q08-email-memory',
    flag_name: 'emailMemoryLeak',
    service: 'email',
    question_text: 'メモリリークの原因となっている処理/変数名は何ですか？',
    answer_keywords: ['send_email', 'deliveries', 'sendemail'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q09-image-slow',
    flag_name: 'imageSlowLoad',
    service: 'frontend',
    question_text: '画像遅延を引き起こすHTTPヘッダー名は何ですか？',
    answer_keywords: ['x-envoy-fault-delay-request', 'envoy-fault-delay'],
    base_points: 100,
    stage: 1,
  },
  {
    question_id: 'q10-kafka-queue',
    flag_name: 'kafkaQueueProblems',
    service: 'kafka',
    question_text: 'キュー問題の原因となっているコンポーネント/処理は何ですか？',
    answer_keywords: ['kafka', 'producer', 'consumer', 'queue'],
    base_points: 100,
    stage: 1,
  },

  // Stage 2: FIS Infrastructure (placeholder - to be expanded)
  {
    question_id: 'q11-fis-cpu',
    flag_name: 'fis-cpu-stress',
    service: 'infrastructure',
    question_text: 'CPU使用率が急上昇しているホスト名/インスタンスIDは何ですか？',
    answer_keywords: [], // Dynamic based on deployment
    base_points: 150,
    stage: 2,
  },
  {
    question_id: 'q12-fis-memory',
    flag_name: 'fis-memory-stress',
    service: 'infrastructure',
    question_text: 'メモリ使用率が急上昇しているプロセス名は何ですか？',
    answer_keywords: ['stress-ng', 'stress'],
    base_points: 150,
    stage: 2,
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
