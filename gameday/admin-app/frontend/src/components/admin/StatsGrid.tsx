import type { StatsResponse } from '../../api/types';

interface StatsGridProps {
  stats: StatsResponse | undefined;
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{stats?.total_teams ?? '-'}</div>
        <div class="stat-label">チーム数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{stats?.total_correct_answers ?? '-'}</div>
        <div class="stat-label">正解数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{stats?.average_score ?? '-'}</div>
        <div class="stat-label">平均スコア</div>
      </div>
    </div>
  );
}
