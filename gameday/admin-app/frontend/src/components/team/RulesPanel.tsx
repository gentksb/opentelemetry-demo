export function RulesPanel() {
  return (
    <details class="rules-panel">
      <summary>ゲームルール</summary>
      <ul>
        <li>Splunk Observability Cloud を使って、アプリケーションの障害原因を特定してください</li>
        <li>
          各問題には <strong>基本100点</strong> が設定されています
        </li>
        <li>時間経過で得点が減少します（1分あたり0.5%、最大50%減少）</li>
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
