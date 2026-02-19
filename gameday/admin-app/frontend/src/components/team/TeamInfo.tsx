interface TeamInfoProps {
  teamName: string;
  teamId: string;
  totalScore: number;
}

export function TeamInfo({ teamName, teamId, totalScore }: TeamInfoProps) {
  return (
    <div class="team-info">
      <div>
        <div class="team-name">{teamName}</div>
        <small>{teamId}</small>
      </div>
      <div class="score">{totalScore} 点</div>
    </div>
  );
}
