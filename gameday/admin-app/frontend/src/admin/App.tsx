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
    updateOrgId,
    updateAstronomyShopUrl,
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

  const [orgIdInput, setOrgIdInput] = useState('');
  const [orgIdMessage, setOrgIdMessage] = useState('');

  const handleUpdateOrgId = async () => {
    try {
      await updateOrgId(orgIdInput);
      setOrgIdMessage('Org ID を更新しました');
      setTimeout(() => setOrgIdMessage(''), 3000);
    } catch {
      setOrgIdMessage('更新に失敗しました');
    }
  };

  const [shopUrlInput, setShopUrlInput] = useState('');
  const [shopUrlMessage, setShopUrlMessage] = useState('');

  const handleUpdateShopUrl = async () => {
    try {
      await updateAstronomyShopUrl(shopUrlInput);
      setShopUrlMessage('URL を更新しました');
      setTimeout(() => setShopUrlMessage(''), 3000);
    } catch {
      setShopUrlMessage('更新に失敗しました');
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
            <button type="button" class="refresh-btn" onClick={refetchAll}>更新</button>
          </div>
        </header>

        <GameBanner
          gameState={gameState.data}
          onStart={startGame}
          onStop={stopGame}
          onReset={resetGame}
        />

        <section style="margin-bottom:1.5rem;padding:1rem;background:rgba(255,255,255,0.05);border-radius:8px;">
          <h2 style="margin:0 0 0.75rem;font-size:1rem;color:rgba(255,255,255,0.7);">Splunk Org ID 設定</h2>
          <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
            <input
              type="text"
              placeholder="例: ABC123xyz"
              value={orgIdInput}
              onInput={(e) => setOrgIdInput((e.target as HTMLInputElement).value)}
              style="flex:1;min-width:200px;padding:0.5rem 0.75rem;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;font-size:0.9rem;"
            />
            <button type="button" class="action-btn" onClick={handleUpdateOrgId}>
              保存
            </button>
            {orgIdMessage && (
              <span style="color:#00ff88;font-size:0.85rem;">{orgIdMessage}</span>
            )}
          </div>
          <small style="color:rgba(255,255,255,0.45);margin-top:0.4rem;display:block;">
            チーム画面のSplunk O11y Cloudリンクに自動付与されます。イベントごとに設定してください。
          </small>
        </section>

        <section style="margin-bottom:1.5rem;padding:1rem;background:rgba(255,255,255,0.05);border-radius:8px;">
          <h2 style="margin:0 0 0.75rem;font-size:1rem;color:rgba(255,255,255,0.7);">Astronomy Shop URL 設定</h2>
          <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
            <input
              type="url"
              placeholder="例: http://1.2.3.4:8080"
              value={shopUrlInput}
              onInput={(e) => setShopUrlInput((e.target as HTMLInputElement).value)}
              style="flex:1;min-width:200px;padding:0.5rem 0.75rem;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;font-size:0.9rem;"
            />
            <button type="button" class="action-btn" onClick={handleUpdateShopUrl}>
              保存
            </button>
            {shopUrlMessage && (
              <span style="color:#00ff88;font-size:0.85rem;">{shopUrlMessage}</span>
            )}
          </div>
          <small style="color:rgba(255,255,255,0.45);margin-top:0.4rem;display:block;">
            チーム画面のゲームシナリオ「Astronomy Shop」にリンクとして表示されます。
          </small>
        </section>

        <StatsGrid stats={stats.data} />

        <CreateTeamForm onCreateTeam={createTeam} />

        <div class="actions">
          <button type="button" class="action-btn secondary" onClick={handleRecalculate}>スコア再計算</button>
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
