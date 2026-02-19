interface O11yLinksProps {
  clusterName: string;
  splunkRealm: string;
}

export function O11yLinks({ clusterName, splunkRealm }: O11yLinksProps) {
  const base = `https://app.${splunkRealm}.signalfx.com`;
  const envName = clusterName;

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
          <a
            href={`${base}/#/apm?environments=${encodeURIComponent(envName)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            APM - サービスマップ &amp; トレース
          </a>
        </li>
        <li>
          <a href={`${base}/#/infrastructure`} target="_blank" rel="noopener noreferrer">
            Infrastructure Monitoring
          </a>
        </li>
        <li>
          <a
            href={`${base}/#/logs?query=deployment.environment%3D${encodeURIComponent(envName)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Log Observer
          </a>
        </li>
      </ul>
    </details>
  );
}
