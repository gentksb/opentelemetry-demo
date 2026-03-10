import { GAME_DURATION_MINUTES, HINT_AVAILABLE_AFTER_MINUTES } from '@gameday-shared/game';

export function RulesPanel() {
  return (
    <details class="rules-panel">
      <summary>ゲームルール</summary>
      <ul>
        <li>Splunk Observability Cloud を使って、アプリケーションの障害原因を特定してください</li>
        <li>総プレイ時間は <strong>{GAME_DURATION_MINUTES}分</strong> を目安に進行します（{GAME_DURATION_MINUTES}分を超えても解答可能）</li>
        <li>ヒントはゲーム開始 <strong>{HINT_AVAILABLE_AFTER_MINUTES}分</strong> 後に表示されます</li>
        <li>
          各問題には <strong>基本100点</strong> が設定されています
        </li>
        <li>時間経過で得点が減少します（{GAME_DURATION_MINUTES}分で最大50%減少）</li>
        <li>
          誤答ごとに <strong>5点</strong> のペナルティがあります
        </li>
        <li>
          正解時の最低得点は <strong>10点</strong> です
        </li>
      </ul>
    </details>
  );
}
