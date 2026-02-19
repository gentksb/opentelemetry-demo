interface ProgressSummaryProps {
  correctCount: number;
  totalCount: number;
  rank: string;
}

export function ProgressSummary({ correctCount, totalCount, rank }: ProgressSummaryProps) {
  return (
    <div class="progress-summary">
      <div class="prog-item">
        <div class="prog-value">{correctCount}</div>
        <div class="prog-label">正解数</div>
      </div>
      <div class="prog-item">
        <div class="prog-value">{totalCount}</div>
        <div class="prog-label">出題数</div>
      </div>
      <div class="prog-item">
        <div class="prog-value">{rank}</div>
        <div class="prog-label">順位</div>
      </div>
    </div>
  );
}
