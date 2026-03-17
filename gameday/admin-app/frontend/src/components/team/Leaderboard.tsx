import type { LeaderboardTeam } from '../../api/types';

interface LeaderboardProps {
  teams: LeaderboardTeam[];
  currentTeamId: string;
}

export function Leaderboard({ teams, currentTeamId }: LeaderboardProps) {
  return (
    <details class="leaderboard">
      <summary>リーダーボード</summary>
      <div class="leaderboard-table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>チーム</th>
              <th>スコア</th>
              <th>正解</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.team_id}
                class={`${t.team_id === currentTeamId ? 'self-row' : ''}`}
              >
                <td
                  class={t.rank <= 3 ? `rank-${t.rank}` : ''}
                  style="font-weight:bold"
                >
                  {t.rank}
                </td>
                <td>{t.team_name}</td>
                <td style="color:#00ff88;font-weight:bold">{t.total_score}</td>
                <td>{t.questions_correct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
