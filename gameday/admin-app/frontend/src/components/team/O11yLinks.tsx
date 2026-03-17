interface O11yLinksProps {
  envName: string;
  splunkRealm: string;
  orgId?: string;
}

export function O11yLinks({ envName, splunkRealm, orgId }: O11yLinksProps) {
  const base = `https://app.${splunkRealm}.signalfx.com`;
  const orgParam = orgId ? `&orgID=${orgId}` : '';

  if (!envName) {
    return (
      <details class="o11y-links">
        <summary>Splunk Observability Cloud リンク</summary>
        <div class="environment-warning">
          <strong>環境名がまだ設定されていません</strong>
          <small>
            管理者に OTel Environment の設定状況を確認してください。設定完了後にこのパネルから各リンクを開けます。
          </small>
        </div>
      </details>
    );
  }

  const apmUrl =
    `${base}/#/apm?environments=${encodeURIComponent(envName)}${orgParam}`;

  const imUrl =
    `${base}/#/kubernetes-overview?endTime=now` +
    `&sf_environment=${encodeURIComponent(envName)}` +
    `&sources%5B%5D=sf_environment:%5B%22${encodeURIComponent(envName)}%22%5D` +
    `&startTime=-1d${orgParam}`;

  const rumFilters = JSON.stringify([{ tag: 'sf_environment', operation: 'IN', values: [envName] }]);
  const rumUrl = `${base}/#/rum?filters=${encodeURIComponent(rumFilters)}${orgParam}`;

  return (
    <details class="o11y-links">
      <summary>Splunk Observability Cloud リンク</summary>
      <div class="environment-card">
        <div class="environment-label">あなたの Environment</div>
        <code class="environment-value">{envName}</code>
        <small class="environment-note">
          APM と Infrastructure Monitoring では、この値でフィルタすると自分たちの環境を追いやすくなります。
        </small>
      </div>
      <ul>
        <li>
          <a href={apmUrl} target="_blank" rel="noopener noreferrer">
            APM - サービスマップ &amp; トレース
          </a>
          <span class="link-description">障害の起点になっているサービスや遅いトレースを確認します。</span>
        </li>
        <li>
          <a href={imUrl} target="_blank" rel="noopener noreferrer">
            Infrastructure Monitoring
          </a>
          <span class="link-description">Kubernetes やホスト側の異常、リソース逼迫を確認します。</span>
        </li>
        <li>
          <a href={rumUrl} target="_blank" rel="noopener noreferrer">
            RUM - エンドユーザーのブラウザ体験・ネットワーク遅延
          </a>
          <span class="link-description">ブラウザ視点の体感遅延やフロントエンドの問題を確認します。</span>
        </li>
      </ul>
    </details>
  );
}
