// ゲーム状態
export interface GameState {
  state: 'waiting' | 'active' | 'finished';
  started_at: string | null;
  elapsed_minutes: number;
}

// 環境設定
export interface Config {
  cluster_name: string;
  splunk_realm: string;
}

// チーム情報
export interface Team {
  team_id: string;
  team_name: string;
  ec2_ip?: string;
  total_score: number;
  questions_correct: number;
  current_stage: number;
  started_at: string;
  last_activity: string;
}

// 問題（参加者向け、answer_keywordsなし）
export interface Question {
  question_id: string;
  flag_name: string;
  service: string;
  question_text: string;
  base_points: number;
  stage: number;
  hint?: string;
  answered: boolean;
}

// 問題一覧レスポンス
export interface QuestionsResponse {
  questions: Question[];
  progress: TeamProgress | null;
}

// チーム進捗
export interface TeamProgress {
  totalScore: number;
  answeredQuestions: string[];
  correctQuestions: string[];
  currentStage: number;
}

// 回答結果
export interface AnswerResult {
  result: 'correct' | 'incorrect';
  answer: {
    team_id: string;
    question_id: string;
    answer_text: string;
    is_correct: boolean;
    points_awarded: number;
    attempt_count: number;
    answered_at: string;
    time_elapsed_minutes: number;
  };
  progress: TeamProgress;
  message: string;
  explanation?: string;
}

// リーダーボード
export interface LeaderboardTeam {
  rank: number;
  team_id: string;
  team_name: string;
  total_score: number;
  questions_correct: number;
  current_stage: number;
}

export interface LeaderboardResponse {
  teams: LeaderboardTeam[];
}

// --- Admin 用型定義 ---

// スコアボード
export interface ScoreboardTeam {
  rank: number;
  team_id: string;
  team_name: string;
  total_score: number;
  questions_correct: number;
  current_stage: number;
  last_activity: string;
}

export interface ScoreboardResponse {
  teams: ScoreboardTeam[];
  total_teams: number;
  total_questions: number;
  updated_at: string;
}

// 統計
export interface QuestionStat {
  question_id: string;
  flag_name: string;
  service: string;
  teams_completed: number;
  completion_rate: number;
}

export interface StatsResponse {
  total_teams: number;
  total_questions: number;
  total_correct_answers: number;
  total_attempts: number;
  average_score: number;
  question_stats: QuestionStat[];
  updated_at: string;
}
