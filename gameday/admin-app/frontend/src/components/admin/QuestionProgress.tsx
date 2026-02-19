import type { QuestionStat } from '../../api/types';

interface QuestionProgressProps {
  questionStats: QuestionStat[];
  totalTeams: number;
}

export function QuestionProgress({ questionStats, totalTeams }: QuestionProgressProps) {
  return (
    <div class="question-progress">
      {questionStats.map((q) => (
        <div class="progress-card" key={q.question_id}>
          <div class="progress-header">
            <span class="progress-service">{q.service}</span>
            <span>{q.completion_rate}%</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" style={{ width: `${q.completion_rate}%` }} />
          </div>
          <div class="progress-text">
            {q.flag_name === 'none' ? '(基本操作)' : q.flag_name} - {q.teams_completed}/{totalTeams} チーム正解
          </div>
        </div>
      ))}
    </div>
  );
}
