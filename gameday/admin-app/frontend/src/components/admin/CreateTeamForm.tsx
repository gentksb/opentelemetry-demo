import { useState } from 'preact/hooks';

interface CreateTeamFormProps {
  onCreateTeam: (name: string) => Promise<void>;
}

export function CreateTeamForm({ onCreateTeam }: CreateTeamFormProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('チーム名を入力してください');
      return;
    }
    try {
      await onCreateTeam(trimmed);
      setName('');
      setError('');
    } catch {
      setError('チームの作成に失敗しました');
    }
  };

  return (
    <div>
      <div class="create-team-form">
        <input
          type="text"
          placeholder="新しいチーム名"
          value={name}
          onInput={(e) => {
            setName((e.target as HTMLInputElement).value);
            setError('');
          }}
          onKeyPress={(e) => { if (e.key === 'Enter') handleCreate(); }}
        />
        <button type="button" onClick={handleCreate}>チーム作成</button>
      </div>
      {error && <div style={{ color: '#ff6b6b', marginTop: '-20px', marginBottom: '20px', fontSize: '0.85rem' }}>{error}</div>}
    </div>
  );
}
