import type { GameState } from '../../api/types';

interface GameStatusBannerProps {
  gameState: GameState | undefined;
}

export function GameStatusBanner({ gameState }: GameStatusBannerProps) {
  if (!gameState) return null;

  const messages: Record<string, string> = {
    waiting: 'ゲーム開始を待っています...',
    active: `ゲーム進行中（経過: ${Math.floor(gameState.elapsed_minutes)}分）`,
    finished: 'ゲームは終了しました',
  };

  return (
    <div class={`game-status-banner ${gameState.state}`}>
      {messages[gameState.state] || gameState.state}
    </div>
  );
}
