import type { GameState } from '../../api/types';

interface GameBannerProps {
  gameState: GameState | undefined;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

const stateLabels: Record<string, string> = {
  waiting: '待機中',
  active: 'ゲーム進行中',
  finished: '終了',
};

export function GameBanner({ gameState, onStart, onStop, onReset }: GameBannerProps) {
  const state = gameState?.state ?? 'waiting';

  const handleStart = () => {
    if (confirm('ゲームを開始しますか？全チームの開始時刻がリセットされます。')) {
      onStart();
    }
  };

  const handleStop = () => {
    if (confirm('ゲームを終了しますか？')) {
      onStop();
    }
  };

  const handleReset = () => {
    if (confirm('ゲーム状態を待機中に戻しますか？')) {
      onReset();
    }
  };

  return (
    <div class={`game-banner ${state}`}>
      <div>
        <span class="state-text">{stateLabels[state] ?? state}</span>
        {state === 'active' && gameState && (
          <span class="elapsed"> (経過: {Math.floor(gameState.elapsed_minutes)}分)</span>
        )}
      </div>
      <div class="game-controls">
        {state === 'waiting' && (
          <button class="btn-start" onClick={handleStart}>ゲーム開始</button>
        )}
        {state === 'active' && (
          <button class="btn-stop" onClick={handleStop}>ゲーム終了</button>
        )}
        {state !== 'waiting' && (
          <button class="btn-reset" onClick={handleReset}>リセット</button>
        )}
      </div>
    </div>
  );
}
