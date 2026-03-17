import { useState } from 'preact/hooks';
import { apiFetch, ApiError } from '../../api/client';
import type { Team } from '../../api/types';

interface LoginFormProps {
  onLogin: (teamId: string) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const id = teamId.trim();
    if (!id) {
      setError('チームIDを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiFetch<Team>(`/api/teams/${id}`);
      onLogin(id);
    } catch (e) {
      if (e instanceof ApiError) {
        setError('チームIDが見つかりません。運営から共有されたチームIDを再確認してください。');
      } else {
        setError('ログイン確認中にエラーが発生しました。少し待ってから再試行してください。');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div class="login-form">
      <h2>チームログイン</h2>
      <p class="login-help">
        運営から配布されたチームIDを入力してログインしてください。
      </p>
      {error && <div class="error-message">{error}</div>}
      <input
        type="text"
        placeholder="チームID（例: team-01）"
        value={teamId}
        autocomplete="organization"
        disabled={loading}
        onInput={(e) => {
          setTeamId((e.target as HTMLInputElement).value);
          if (error) setError('');
        }}
        onKeyPress={handleKeyPress}
      />
      <div class="login-status" aria-live="polite">
        {loading ? 'チーム情報を確認しています...' : 'Enter キーでもログインできます'}
      </div>
      <button type="button" onClick={handleLogin} disabled={loading}>
        {loading ? 'ログイン中...' : 'ログイン'}
      </button>
    </div>
  );
}
