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
        setError('チームが見つかりません');
      } else {
        setError('エラーが発生しました');
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
      {error && <div class="error-message">{error}</div>}
      <input
        type="text"
        placeholder="チームID（例: team-01）"
        value={teamId}
        onInput={(e) => setTeamId((e.target as HTMLInputElement).value)}
        onKeyPress={handleKeyPress}
      />
      <button onClick={handleLogin} disabled={loading}>
        {loading ? 'ログイン中...' : 'ログイン'}
      </button>
    </div>
  );
}
