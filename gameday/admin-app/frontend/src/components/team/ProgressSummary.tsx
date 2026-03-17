interface ProgressSummaryProps {
  correctCount: number;
  totalCount: number;
  rank: string;
}

export function ProgressSummary({ correctCount, totalCount, rank }: ProgressSummaryProps) {
  const remainingCount = Math.max(totalCount - correctCount, 0);

  return (
    <div class="progress-summary">
      <div class="prog-item">
        <div class="prog-value">{correctCount}</div>
        <div class="prog-label">正解済み</div>
      </div>
      <div class="prog-item">
        <div class="prog-value">{correctCount}/{totalCount}</div>
        <div class="prog-label">進捗</div>
      </div>
      <div class="prog-item">
        <div class="prog-value">{rank}</div>
        <div class="prog-label">順位</div>
      </div>
      <div class="prog-item">
        <div class="prog-value">{remainingCount}</div>
        <div class="prog-label">未回答</div>
      </div>
    </div>
  );
}
