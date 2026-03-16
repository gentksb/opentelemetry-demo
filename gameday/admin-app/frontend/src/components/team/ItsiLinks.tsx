interface ItsiLinksProps {
  itsiUrl?: string;
  itsiUsername?: string;
  itsiPassword?: string;
}

export function ItsiLinks({ itsiUrl, itsiUsername, itsiPassword }: ItsiLinksProps) {
  if (!itsiUrl) return null;

  return (
    <details class="o11y-links">
      <summary>ITSI (IT Service Intelligence) リンク</summary>
      <div style="margin:10px 0;padding:10px;background:rgba(0,212,255,0.1);border-radius:5px;">
        <a href={itsiUrl} target="_blank" rel="noopener noreferrer" style="color:#00d4ff;font-weight:bold;">
          ITSI を開く
        </a>
      </div>
      {(itsiUsername || itsiPassword) && (
        <div style="margin:10px 0;padding:10px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:5px;">
          <strong style="color:rgba(255,255,255,0.8);display:block;margin-bottom:0.4rem;">共有認証情報（全チーム共通）</strong>
          {itsiUsername && (
            <div style="margin-bottom:0.25rem;">
              ユーザー名: <code style="color:#00ff88;">{itsiUsername}</code>
            </div>
          )}
          {itsiPassword && (
            <div>
              パスワード: <code style="color:#00ff88;">{itsiPassword}</code>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
