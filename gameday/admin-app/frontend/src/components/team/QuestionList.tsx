import type { Question, AnswerResult } from '../../api/types';
import { QuestionCard } from './QuestionCard';

interface QuestionListProps {
  questions: Question[];
  gameState: string;
  explanationCache: Record<string, string>;
  incorrectCache: Record<string, { message: string; attemptCount: number }>;
  pointsCache: Record<string, number>;
  onSubmit: (questionId: string, answerText: string) => Promise<AnswerResult>;
}

export function QuestionList({
  questions,
  gameState,
  explanationCache,
  incorrectCache,
  pointsCache,
  onSubmit,
}: QuestionListProps) {
  return (
    <div class="question-list">
      {questions.map((q, index) => (
        <QuestionCard
          key={q.question_id}
          question={q}
          questionIndex={index + 1}
          gameState={gameState}
          explanationCache={explanationCache}
          incorrectCache={incorrectCache}
          pointsCache={pointsCache}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  );
}
