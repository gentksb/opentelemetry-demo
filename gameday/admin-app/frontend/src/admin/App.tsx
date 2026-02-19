import { useState, useCallback } from 'preact/hooks';
import { useAdminData } from '../hooks/useAdminData';
import { AuthOverlay } from '../components/admin/AuthOverlay';
import { GameBanner } from '../components/admin/GameBanner';
import { StatsGrid } from '../components/admin/StatsGrid';
import { CreateTeamForm } from '../components/admin/CreateTeamForm';
import { Scoreboard } from '../components/admin/Scoreboard';
import { QuestionProgress } from '../components/admin/QuestionProgress';

export function App() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(true);

  const onAuthRequired = useCallback(() => {
    setShowAuth(true);
  }, []);

  const {
    scoreboard,
    stats,
    gameState,
    refetchAll,
    startGame,
    stopGame,
    resetGame,
    createTeam,
    deleteTeam,
    resetTeam,
    recalculateScores,
  } = useAdminData({ token: adminToken, onAuthRequired });

  const handleLogin = (token: string) => {
    setAdminToken(token);
    setShowAuth(false);
  };

  const handleSkip = () => {
    setAdminToken('');
    setShowAuth(false);
  };

  const [recalcMessage, setRecalcMessage] = useState('');

  const handleRecalculate = async () => {
    try {
      await recalculateScores();
      setRecalcMessage('スコアを再計算しました');
      setTimeout(() => setRecalcMessage(''), 3000);
    } catch {
      setRecalcMessage('スコア再計算に失敗しました');
    }
  };

  const lastUpdate = scoreboard.data
    ? `最終更新: ${new Date().toLocaleTimeString('ja-JP')}`
    : '-';

  return (
    <>
      <AuthOverlay visible={showAuth} onLogin={handleLogin} onSkip={handleSkip} />

      <div class="container">
        <header>
          <h1>o11y Game Day - 運営ダッシュボード</h1>
          <div>
            <span class="last-update">{lastUpdate}</span>{' '}
            <button class="refresh-btn" onClick={refetchAll}>更新</button>
          </div>
        </header>

        <GameBanner
          gameState={gameState.data}
          onStart={startGame}
          onStop={stopGame}
          onReset={resetGame}
        />

        <StatsGrid stats={stats.data} />

        <CreateTeamForm onCreateTeam={createTeam} />

        <div class="actions">
          <button class="action-btn secondary" onClick={handleRecalculate}>スコア再計算</button>
          {recalcMessage && (
            <span style={{ color: '#00ff88', alignSelf: 'center', fontSize: '0.85rem' }}>
              {recalcMessage}
            </span>
          )}
        </div>

        <h2 class="section-title">スコアボード</h2>
        <Scoreboard
          teams={scoreboard.data?.teams ?? []}
          onResetTeam={resetTeam}
          onDeleteTeam={deleteTeam}
        />

        <h2 class="section-title">問題別正解率</h2>
        <QuestionProgress
          questionStats={stats.data?.question_stats ?? []}
          totalTeams={stats.data?.total_teams ?? 0}
        />
      </div>
    </>
  );
}
