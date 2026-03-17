interface TeamInfoProps {
  teamName: string;
  teamId: string;
  totalScore: number;
}

export function TeamInfo({ teamName, teamId, totalScore }: TeamInfoProps) {
  return (
    <div class="team-info">
      <div class="team-meta">
        <div class="team-name">{teamName}</div>
        <div class="team-id-group">
          <span class="team-id-label">チームID</span>
          <code class="team-id-value">{teamId}</code>
        </div>
      </div>
      <div class="score">{totalScore} 点</div>
    </div>
  );
}
