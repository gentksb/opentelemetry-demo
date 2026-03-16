import { useCallback } from 'preact/hooks';
import useSWR from 'swr';
import { authFetch, apiFetch, ApiError } from '../api/client';
import type { ScoreboardResponse, StatsResponse, GameState } from '../api/types';

interface UseAdminDataOptions {
  token: string | null;
  onAuthRequired: () => void;
}

export function useAdminData({ token, onAuthRequired }: UseAdminDataOptions) {
  const onError = useCallback(
    (e: Error) => {
      if (e instanceof ApiError && e.status === 401) {
        onAuthRequired();
      }
    },
    [onAuthRequired],
  );

  const scoreboard = useSWR<ScoreboardResponse>(
    token !== null ? '/api/admin/scoreboard' : null,
    (url) => authFetch<ScoreboardResponse>(token!, url),
    { refreshInterval: 10_000, onError },
  );

  const stats = useSWR<StatsResponse>(
    token !== null ? '/api/admin/stats' : null,
    (url) => authFetch<StatsResponse>(token!, url),
    { refreshInterval: 10_000, onError },
  );

  const gameState = useSWR<GameState>(
    '/api/game/state',
    (url) => apiFetch<GameState>(url),
    { refreshInterval: 10_000 },
  );

  const refetchAll = useCallback(() => {
    scoreboard.mutate();
    stats.mutate();
    gameState.mutate();
  }, [scoreboard.mutate, stats.mutate, gameState.mutate]);

  // ゲーム制御
  const startGame = useCallback(async () => {
    await authFetch(token ?? '', '/api/admin/game/start', { method: 'POST' });
    refetchAll();
  }, [token, refetchAll]);

  const stopGame = useCallback(async () => {
    await authFetch(token ?? '', '/api/admin/game/stop', { method: 'POST' });
    refetchAll();
  }, [token, refetchAll]);

  const resetGame = useCallback(async () => {
    await authFetch(token ?? '', '/api/admin/game/reset', { method: 'POST' });
    refetchAll();
  }, [token, refetchAll]);

  // チーム操作
  const createTeam = useCallback(async (name: string) => {
    await apiFetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name: name }),
    });
    refetchAll();
  }, [refetchAll]);

  const deleteTeam = useCallback(async (teamId: string) => {
    await authFetch(token ?? '', `/api/teams/${teamId}`, { method: 'DELETE' });
    refetchAll();
  }, [token, refetchAll]);

  const resetTeam = useCallback(async (teamId: string) => {
    await authFetch(token ?? '', `/api/admin/teams/${teamId}/reset`, { method: 'POST' });
    refetchAll();
  }, [token, refetchAll]);

  const recalculateScores = useCallback(async () => {
    await authFetch(token ?? '', '/api/admin/recalculate-scores', { method: 'POST' });
    refetchAll();
  }, [token, refetchAll]);

  const updateOrgId = useCallback(async (orgId: string) => {
    await authFetch(token ?? '', '/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    });
  }, [token]);

  const updateAstronomyShopUrl = useCallback(async (url: string) => {
    await authFetch(token ?? '', '/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ astronomy_shop_url: url }),
    });
  }, [token]);

  const updateOtelEnv = useCallback(async (env: string) => {
    await authFetch(token ?? '', '/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otel_env: env }),
    });
  }, [token]);

  const updateItsiConfig = useCallback(async (url: string, username: string, password: string) => {
    await authFetch(token ?? '', '/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itsi_url: url, itsi_username: username, itsi_password: password }),
    });
  }, [token]);

  return {
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
    updateOtelEnv,
    updateItsiConfig,
  };
}
