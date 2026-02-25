import { useState } from 'preact/hooks';
import type { Question, AnswerResult } from '../../api/types';

interface QuestionCardProps {
  question: Question;
  questionIndex: number;
  gameState: string;
  explanationCache: Record<string, string>;
  incorrectCache: Record<string, { message: string; attemptCount: number }>;
  onSubmit: (questionId: string, answerText: string) => Promise<AnswerResult>;
}

export function QuestionCard({
  question,
  questionIndex,
  gameState,
  explanationCache,
  incorrectCache,
  onSubmit,
}: QuestionCardProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const explanation = question.explanation || explanationCache[question.question_id];
  const incorrect = incorrectCache[question.question_id];

  const handleSubmit = async () => {
    if (gameState !== 'active') {
      setLocalError('ゲームが開始されていません。運営の開始を待ってください。');
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
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  if (question.answered) {
    return (
      <div class="question-card answered">
        <div class="question-header">
          <span class="question-service">Q{questionIndex} - {question.service}</span>
          <span class="question-points">{question.base_points}点</span>
        </div>
        <div class="question-text">{question.question_text}</div>
        <div class="result-message correct">正解済み</div>
        {explanation && <div class="explanation-box">{explanation}</div>}
      </div>
    );
  }

  return (
    <div class="question-card">
      <div class="question-header">
        <span class="question-service">Q{questionIndex} - {question.service}</span>
        <span class="question-points">{question.base_points}点</span>
      </div>
      <div class="question-text">{question.question_text}</div>
      {question.hint && <div class="hint-text">{question.hint}</div>}
      <div class="answer-form">
        <input
          type="text"
          class="answer-input"
          placeholder="回答を入力..."
          value={answer}
          onInput={(e) => setAnswer((e.target as HTMLInputElement).value)}
          onKeyPress={handleKeyPress}
        />
        <button
          type="button"
          class="submit-btn"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? '送信中...' : '送信'}
        </button>
      </div>
      {localError && <div class="result-message incorrect">{localError}</div>}
      {!localError && incorrect && (
        <div class="result-message incorrect">{incorrect.message}</div>
      )}
    </div>
  );
}
