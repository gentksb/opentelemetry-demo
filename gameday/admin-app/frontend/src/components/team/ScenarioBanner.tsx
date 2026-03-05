interface ScenarioBannerProps {
  astronomyShopUrl?: string;
}

function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function ScenarioBanner({ astronomyShopUrl }: ScenarioBannerProps) {
  const safeUrl = astronomyShopUrl && isSafeUrl(astronomyShopUrl) ? astronomyShopUrl : undefined;
  const shopName = safeUrl ? (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer" style="color:#7fb3f5;text-decoration:underline;">Astronomy Shop</a>
  ) : (
    <strong>Astronomy Shop</strong>
  );

  return (
    <details class="scenario-banner" open>
      <summary>ゲームシナリオ</summary>
      <div class="scenario-banner-content">
        <p>あなたは新任SREエンジニアです。今日から {shopName}（星座をテーマにしたECサイト）の運用チームに参加しました。</p>
        <p>アプリケーションでは現在いくつかの問題が発生しており、顧客からの問い合わせ、同僚からの相談、システムアラートが届いています。</p>
        <p><strong>Splunk Observability Cloud</strong> を活用してトラブルシューティングを行い、各問題の根本原因を特定してください。<br />Splunk Observability Cloud を使って根拠を確認した上で回答してください。</p>
      </div>
    </details>
  );
}
