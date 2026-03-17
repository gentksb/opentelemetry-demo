import { useState } from 'preact/hooks';
import type { Question, AnswerResult } from '../../api/types';

const TRIGGER_LABELS: Record<string, string> = {
  customer: '顧客からの問い合わせ',
  colleague: '同僚からの相談',
  alert: 'システムアラート',
  challenge: 'チャレンジ',
};

interface QuestionCardProps {
  question: Question;
  questionIndex: number;
  gameState: string;
  explanationCache: Record<string, string>;
  incorrectCache: Record<string, { message: string; attemptCount: number }>;
  pointsCache: Record<string, number>;
  onSubmit: (questionId: string, answerText: string) => Promise<AnswerResult>;
}

export function QuestionCard({
  question,
  questionIndex,
  gameState,
  explanationCache,
  incorrectCache,
  pointsCache,
  onSubmit,
}: QuestionCardProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const explanation = question.explanation || explanationCache[question.question_id];
  const incorrect = incorrectCache[question.question_id];
  const triggerLabel = question.trigger_type ? TRIGGER_LABELS[question.trigger_type] : undefined;
  const isHard = question.difficulty === 'hard';
  const isGameActive = gameState === 'active';
  const inactiveMessage = gameState === 'finished'
    ? '回答受付は終了しました。結果や解説を確認してください。'
    : 'ゲーム開始待ちです。開始後に回答を送信できます。';

  const handleSubmit = async () => {
    if (!isGameActive) {
      setLocalError(inactiveMessage);
      return;
    }

    const text = answer.trim();
    if (!text) {
      setLocalError('回答を入力してください');
      return;
    }

    setSubmitting(true);
    setLocalError('');

    try {
      const result = await onSubmit(question.question_id, text);
      if (result.result === 'incorrect') {
        setAnswer('');
      }
    } catch {
      setLocalError('エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && isGameActive) {
      handleSubmit();
    }
  };

  if (question.answered) {
    return (
      <div class="question-card answered">
        <div class="question-header">
          <div class="question-header-left">
            <span class="question-service">Q{questionIndex}</span>
            {triggerLabel && (
              <span class={`trigger-badge trigger-${question.trigger_type}`}>{triggerLabel}</span>
            )}
            {isHard && <span class="difficulty-badge difficulty-hard">難問</span>}
          </div>
          <span class="question-points">
            {pointsCache[question.question_id] !== undefined
              ? `${pointsCache[question.question_id]}/${question.base_points}点`
              : `${question.base_points}点`}
          </span>
        </div>
        <div class="question-body">
          {question.scenario && <p>{question.scenario}</p>}
          <p>{question.question_text}</p>
        </div>
        <div class="result-message correct">
          <strong>正解済み</strong>
          {pointsCache[question.question_id] !== undefined
            ? ` +${pointsCache[question.question_id]}点獲得`
            : ` ${question.base_points}点`}
        </div>
        {explanation && <div class="explanation-box">{explanation}</div>}
      </div>
    );
  }

  return (
    <div class="question-card">
      <div class="question-header">
        <div class="question-header-left">
          <span class="question-service">Q{questionIndex}</span>
          {triggerLabel && (
            <span class={`trigger-badge trigger-${question.trigger_type}`}>{triggerLabel}</span>
          )}
          {isHard && <span class="difficulty-badge difficulty-hard">難問</span>}
        </div>
        <span class="question-points">{question.base_points}点</span>
      </div>
      <div class="question-body">
        {question.scenario && <p>{question.scenario}</p>}
        <p>{question.question_text}</p>
      </div>
      {question.hint && <div class="hint-text">{question.hint}</div>}
      {!isGameActive && <div class="answer-state-note">{inactiveMessage}</div>}
      <div class="answer-form">
        <input
          type="text"
          class="answer-input"
          placeholder={isGameActive ? '回答を入力...' : 'ゲーム開始後に入力できます'}
          value={answer}
          disabled={!isGameActive || submitting}
          onInput={(e) => setAnswer((e.target as HTMLInputElement).value)}
          onKeyPress={handleKeyPress}
        />
        <button
          type="button"
          class="submit-btn"
          onClick={handleSubmit}
          disabled={!isGameActive || submitting}
        >
          {submitting ? '送信中...' : isGameActive ? '送信' : '開始待ち'}
        </button>
      </div>
      {localError && <div class="result-message incorrect">{localError}</div>}
      {!localError && incorrect && (
        <div class="result-message incorrect">
          <strong>不正解</strong> {incorrect.message} 再回答は可能ですが、誤答ごとにペナルティがあります。
        </div>
      )}
    </div>
  );
}
