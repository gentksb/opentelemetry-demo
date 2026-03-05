interface O11yLinksProps {
  clusterName: string;
  splunkRealm: string;
  orgId?: string;
}

export function O11yLinks({ clusterName, splunkRealm, orgId }: O11yLinksProps) {
  const base = `https://app.${splunkRealm}.signalfx.com`;
  const envName = clusterName;
  const orgParam = orgId ? `&orgID=${orgId}` : '';

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
      {clusterName && (
        <div style="margin:10px 0;padding:10px;background:rgba(0,212,255,0.1);border-radius:5px;">
          あなたのEnvironment: <code style="color:#00ff88;font-size:1.1rem;">{envName}</code>
          <br />
          <small style="color:rgba(255,255,255,0.6);">
            APMやInfrastructure Monitoringでこの値でフィルタしてください
          </small>
        </div>
      )}
      <ul>
        <li>
          <a href={apmUrl} target="_blank" rel="noopener noreferrer">
            APM - サービスマップ &amp; トレース
          </a>
        </li>
        <li>
          <a href={imUrl} target="_blank" rel="noopener noreferrer">
            Infrastructure Monitoring
          </a>
        </li>
        <li>
          <a href={rumUrl} target="_blank" rel="noopener noreferrer">
            RUM - エンドユーザーのブラウザ体験・ネットワーク遅延
          </a>
        </li>
      </ul>
    </details>
  );
}
