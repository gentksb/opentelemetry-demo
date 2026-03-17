import type { GameState } from '../../api/types';
import { GAME_DURATION_MINUTES } from '@gameday-shared/game';

interface GameStatusBannerProps {
  gameState: GameState | undefined;
}

export function GameStatusBanner({ gameState }: GameStatusBannerProps) {
  if (!gameState) return null;

  const messages: Record<string, { title: string; detail: string }> = {
    waiting: {
      title: 'ゲーム開始待ち',
      detail: '問題文は確認できます。回答は運営が開始したあとに送信してください。',
    },
    active: {
      title: `ゲーム進行中（経過: ${Math.floor(gameState.elapsed_minutes)}分 / ${GAME_DURATION_MINUTES}分）`,
      detail: 'Splunk Observability Cloud で根拠を確認しながら、回答を送信してください。',
    },
    finished: {
      title: '回答受付は終了しました',
      detail: '結果確認の時間です。必要があれば運営の案内を待ってください。',
    },
  };

  const message = messages[gameState.state] ?? {
    title: gameState.state,
    detail: '',
  };

  return (
    <div class={`game-status-banner ${gameState.state}`}>
      <strong>{message.title}</strong>
      {message.detail && <div class="game-status-detail">{message.detail}</div>}
    </div>
  );
}
