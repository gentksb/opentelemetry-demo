import useSWR from 'swr';
import { apiFetch } from '../api/client';
import type { GameState } from '../api/types';

export function useGameState(enabled: boolean) {
  return useSWR<GameState>(
    enabled ? '/api/game/state' : null,
    (url) => apiFetch<GameState>(url),
    { refreshInterval: 5000 },
  );
}
