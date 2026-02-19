import { useState } from 'preact/hooks';
import type { ScoreboardTeam } from '../../api/types';

interface ScoreboardProps {
  teams: ScoreboardTeam[];
  onResetTeam: (teamId: string) => void;
  onDeleteTeam: (teamId: string) => void;
}

export function Scoreboard({ teams, onResetTeam, onDeleteTeam }: ScoreboardProps) {
  const [copied, setCopied] = useState(false);

  const handleReset = (teamId: string) => {
    if (confirm(`${teamId}の進行状況をリセットしますか？`)) {
      onResetTeam(teamId);
    }
  };

  const handleDelete = (teamId: string) => {
    if (confirm(`${teamId} を削除しますか？関連する回答データもすべて削除されます。`)) {
      onDeleteTeam(teamId);
    }
  };

  const handleCopyAllTeams = async () => {
    const text = teams
      .map((t) => `- ${t.team_name}\n  - チームID: ${t.team_id}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="scoreboard">
      {teams.length > 0 && (
        <div style={{ marginBottom: '12px', textAlign: 'right' }}>
          <button
            type="button"
            class="copy-teams-btn"
            onClick={handleCopyAllTeams}
          >
            {copied ? 'コピーしました!' : '全チーム名とIDをコピー'}
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>順位</th>
            <th>チーム名</th>
            <th>チームID</th>
            <th>スコア</th>
            <th>正解数</th>
            <th>最終更新</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.team_id}>
              <td class={`rank${team.rank <= 3 ? ` rank-${team.rank}` : ''}`}>{team.rank}</td>
              <td style={{ fontWeight: 'bold' }}>{team.team_name}</td>
              <td><code style={{ color: '#888', fontSize: '0.9em' }}>{team.team_id}</code></td>
              <td style={{ fontWeight: 'bold', color: '#00ff88' }}>{team.total_score}</td>
              <td>{team.questions_correct}</td>
              <td>
                <small>
                  {team.last_activity
                    ? new Date(team.last_activity).toLocaleString('ja-JP')
                    : '-'}
                </small>
              </td>
              <td>
                <div class="team-actions">
                  <button type="button" class="reset" onClick={() => handleReset(team.team_id)}>リセット</button>
                  <button type="button" class="delete-btn" onClick={() => handleDelete(team.team_id)}>削除</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
