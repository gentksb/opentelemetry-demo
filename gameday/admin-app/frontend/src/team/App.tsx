import { useState, useCallback } from 'preact/hooks';
import useSWR from 'swr';
import { apiFetch } from '../api/client';
import type { Config } from '../api/types';
import { useGameState } from '../hooks/useGameState';
import { useTeamData } from '../hooks/useTeamData';
import { LoginForm } from '../components/team/LoginForm';
import { GameStatusBanner } from '../components/team/GameStatusBanner';
import { ScenarioBanner } from '../components/team/ScenarioBanner';
import { O11yLinks } from '../components/team/O11yLinks';
import { RulesPanel } from '../components/team/RulesPanel';
import { TeamInfo } from '../components/team/TeamInfo';
import { ProgressSummary } from '../components/team/ProgressSummary';
import { Leaderboard } from '../components/team/Leaderboard';
import { QuestionList } from '../components/team/QuestionList';

export function App() {
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(() => {
    return localStorage.getItem('teamId');
  });

  const isLoggedIn = currentTeamId !== null;

  const { data: config } = useSWR<Config>(
    isLoggedIn ? '/api/config' : null,
    (url: string) => apiFetch<Config>(url),
    { refreshInterval: 15000 },
  );
  const splunkRealm = config?.splunk_realm || 'jp0';
  const orgId = config?.splunk_org_id;
  const astronomyShopUrl = config?.astronomy_shop_url;
  // otel_env が設定されていればそれを使用。未設定時は空文字（O11yLinks 側で警告表示）
  const otelEnv = config?.otel_env || '';

  const { data: gameState } = useGameState(isLoggedIn);
  const {
    team,
    questions,
    leaderboard,
    explanationCache,
    incorrectCache,
    pointsCache,
    loading,
    submitAnswer,
  } = useTeamData(currentTeamId);

  const handleLogin = useCallback((teamId: string) => {
    localStorage.setItem('teamId', teamId);
    setCurrentTeamId(teamId);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('teamId');
    setCurrentTeamId(null);
  }, []);

  if (!isLoggedIn) {
    return (
      <div class="container">
        <LoginForm onLogin={handleLogin} />
      </div>
    );
  }

  const questionsList = questions?.questions ?? [];
  const correctCount = questionsList.filter((q) => q.answered).length;
  const leaderboardTeams = leaderboard?.teams ?? [];
  const myRank = leaderboardTeams.find((t) => t.team_id === currentTeamId);
  const rankDisplay = myRank ? `${myRank.rank}/${leaderboardTeams.length}` : '-';

  return (
    <div class="container">
      <header>
        <div class="header-content">
          <div>
            <h1>o11y Game Day</h1>
            <p>Splunk Observability Cloud トラブルシューティングチャレンジ</p>
          </div>
          <button type="button" class="logout-btn" onClick={handleLogout}>ログアウト</button>
        </div>
      </header>

      <GameStatusBanner gameState={gameState} />

      <ScenarioBanner astronomyShopUrl={astronomyShopUrl} />

      {config !== undefined && <O11yLinks envName={otelEnv} splunkRealm={splunkRealm} orgId={orgId} />}

      <RulesPanel />

      <TeamInfo
        teamName={team?.team_name ?? '-'}
        teamId={currentTeamId}
        totalScore={team?.total_score ?? 0}
      />

      <ProgressSummary
        correctCount={correctCount}
        totalCount={questionsList.length}
        rank={rankDisplay}
      />

      <Leaderboard teams={leaderboardTeams} currentTeamId={currentTeamId} />

      {loading && questionsList.length === 0 ? (
        <div id="loading">
          <div class="spinner" />
          <p>問題を読み込み中...</p>
        </div>
      ) : (
        <QuestionList
          questions={questionsList}
          gameState={gameState?.state ?? 'waiting'}
          explanationCache={explanationCache}
          incorrectCache={incorrectCache}
          pointsCache={pointsCache}
          onSubmit={submitAnswer}
        />
      )}
    </div>
  );
}
