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

// 全7問を同時出題。フラグ切替なしの単一フェーズ運用。
// 必要なFeature Flags（全て同時にON）:
//   cartFailure, imageSlowLoad, adHighCpu, paymentServiceFailure(default 50%)
//
// flag_name = 'none' の設問はFeature Flagに依存しない基本操作問題。
//
// 全設問は「顧客からの問い合わせ」「同僚からの相談」「システムアラート」のいずれかを
// 起点とするSREロールプレイ形式。参加者はSREチームの一員として障害対応を行う。
export const QUESTIONS: Question[] = [
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

  // Q4: RUM Performance - 遅延の影響範囲を判断
  {
    question_id: 'q04-image-slow-rum',
    flag_name: 'imageSlowLoad',
    service: 'frontend',
    trigger_type: 'customer',
    difficulty: 'normal',
    scenario: '複数の顧客から「商品画像の表示が異常に遅い」と報告がありました。画像は静的配信しており、バックエンドのエラーは出ていないようです。RUM（Real User Monitoring）でエンドユーザーの実体験を確認し、影響範囲を判断してください。',
    question_text: 'RUM の Network Requests タブで画像リクエストの遅延状況を確認してください。「全ての顧客が影響を受けている可能性が高い」と言えますか？ YES か NO で答えてください。',
    answer_keywords: ['yes', 'はい'],
    base_points: 100,
    stage: 1,
    hint: 'Splunk Observability Cloud > RUM を開いてください。対象のアプリケーションを選択し、Network Requests タブを開いてください。Response Time でソートすると遅延しているリクエストが見つかります。テーブルに表示されている P50・P75・P99 の各パーセンタイル値を確認し、遅延が特定のユーザーに限られているか、広く発生しているかを判断してください。',
    explanation: 'RUM の Network Requests タブで画像リクエストを確認すると、P50・P75・P99 の全パーセンタイルで5秒以上の遅延が発生しています。P50（中央値）で遅延が出ているということは少なくとも半数以上のユーザーが影響を受けており、特定のユーザーや端末に限らない問題です。全パーセンタイルで遅延が一様に発生していることから、障害が全ユーザーに影響している可能性が高いと判断できます。パーセンタイル分布を見ることで、バックエンドのエラーログに現れない「体験の劣化」の影響範囲を定量的に把握できるのが RUM の強みです。',
  },

  // Q6: Infrastructure Navigator - K8s コンテナの再起動異常を特定
  {
    question_id: 'q06-infra-restarts',
    flag_name: 'none',
    service: 'checkout',
    trigger_type: 'alert',
    difficulty: 'normal',
    scenario: 'システムアラートで Kubernetes クラスタ上のコンテナが予期せぬ再起動をしていることが検知されました。どのサービスが不安定な状態にあるか、Infrastructure Navigator で調査してください。',
    question_text: 'gameday-kindクラスタ("k8s.cluster.name = gameday-kind")のうち、過去24時間で再起動回数（Restarts）が最も多いコンテナ名を答えてください。',
    answer_keywords: ['checkout', "cart"],
    base_points: 100,
    stage: 1,
    hint: 'Splunk Observability Cloud > Infrastructure > Kubernetes entities を開いてください。フィルタで"k8s.cluster.name = gameday-kind"を設定して、Containers ビューに切り替えてください。Restarts の列に注目して、最も多く再起動しているコンテナを探してください。',
    explanation: 'Kubernetes entities の Containers ビューで Restarts 列をクリックしてソート順を変更すると、最も多く再起動しているコンテナを特定できます。gameday-kind クラスタでは checkout と cart のコンテナが複数回再起動しています。Infrastructure からコンテナの状態を確認することで、APM のトレースやエラーログに現れないインフラ起因の不安定要因を特定できます。',
  },

  // Q10: APM Latency - CPU高負荷によるレイテンシ悪化サービスを特定
  {
    question_id: 'q10-ad-latency',
    flag_name: 'adHighCpu',
    service: 'ad',
    trigger_type: 'alert',
    difficulty: 'normal',
    scenario: 'Critical システムアラートで一部サービスのレイテンシが通常より大幅に高いことが検知されました。APM の Explore でサービス一覧のレイテンシを確認し、最も深刻なサービスを特定してください。',
    question_text: 'APM の Overview で Health が "Critical" になっているサービスのレイテンシを確認し、突出して高いレイテンシを示しているサービス名を1つ答えてください。',
    answer_keywords: ['ad', 'checkout', 'payment', 'flaged_ui'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Overview を開いてください。画面下部に全サービスの一覧が表示されます。Latency の列を確認し、他のサービスと比べて際立って高い値を示しているサービスを探してください。',
    explanation: 'APM の Overview でサービス一覧のレイテンシを確認すると、突出して高いsec単位のレイテンシを示しているサービスがいくつかあります。APM Overview は「どのサービスが遅いか」を一覧で確認するための出発点として非常に有効です。',
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
    answer_keywords: ['ButtercupPayments'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Service Map を開き、checkout サービスのノードをクリックしてください。下流サービスへの接続線の色を確認し、Root Causeとなっているサービスを探してください。',
    explanation: 'Service Map で checkout の下流を確認すると、payment サービスへの接続が赤く表示されエラーが発生していますが、網掛けの赤は根本原因ではなく波及エラーを表します。外部決済サービス（ButtercupPayments）が根本原因です。Service Map はエラーの伝播経路を視覚的に把握するのに効果的です。',
  },

  // Q9: APM Tag Spotlight - バージョン起因のエラーを特定
  {
    question_id: 'q09-payment-version',
    flag_name: 'paymentServiceFailure',
    service: 'payment',
    trigger_type: 'alert',
    difficulty: 'hard',
    scenario: '前の調査でが checkout エラーの発生元が判明しました。SRE チームは対応策を検討していますが、まず「根本原因が何か」を正確に特定する必要があります。APM の Tag Spotlight を使って調査してください。',
    question_text: 'APM の Tag Spotlight で payment サービスのスパンをタグ別に分析し、エラー率が高いタグの値を答えてください。',
    answer_keywords: ['v350.10', '350.10'],
    base_points: 100,
    stage: 1,
    hint: 'APM > Overview で payment サービスを選択してください。サービス詳細の Tag Spotlight タブを開き、version タグを探してください。各バージョンのエラー率（Error Ratio）の違いを確認してください。',
    explanation: 'APM の Tag Spotlight で version タグを確認すると、v350.10 が高いエラー率を示しています。成功するリクエストは v350.9 を使用しますが、v350.10 では ButtercupPayments への認証トークンが無効なため HTTP 401 エラーが返されます。Tag Spotlight はどのディメンション（バージョン、リージョン、ユーザー等）でエラーが集中しているかを迅速に特定できる機能で、実際のインシデント対応ではロールバック対象バージョンの特定に活用できます。',
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
