import { useState } from 'preact/hooks';

interface AuthOverlayProps {
  visible: boolean;
  onLogin: (token: string) => void;
  onSkip: () => void;
}

export function AuthOverlay({ visible, onLogin, onSkip }: AuthOverlayProps) {
  const [password, setPassword] = useState('');

  if (!visible) return null;

  const handleLogin = () => {
    onLogin(password);
    setPassword('');
  };

  return (
    <div class="auth-overlay">
      <div class="auth-form">
        <h2>管理者ログイン</h2>
        <input
          type="password"
          placeholder="管理者パスワード"
          value={password}
          autocomplete="one-time-code"
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          onKeyPress={(e) => { if (e.key === 'Enter') handleLogin(); }}
        />
        <button type="button" onClick={handleLogin}>ログイン</button>
        <button type="button" class="skip-btn" onClick={onSkip}>パスワード未設定の場合スキップ</button>
      </div>
    </div>
  );
}
