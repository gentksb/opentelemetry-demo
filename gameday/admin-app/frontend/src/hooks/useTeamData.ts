import { useState, useCallback } from 'preact/hooks';
import useSWR from 'swr';
import { apiFetch } from '../api/client';
import type {
  Team,
  QuestionsResponse,
  LeaderboardResponse,
  AnswerResult,
} from '../api/types';

export function useTeamData(teamId: string | null) {
  const [explanationCache, setExplanationCache] = useState<Record<string, string>>({});
  const [pointsCache, setPointsCache] = useState<Record<string, number>>({});
  const [incorrectCache, setIncorrectCache] = useState<
    Record<string, { message: string; attemptCount: number }>
  >({});

  const { data: team, mutate: mutateTeam } = useSWR<Team>(
    teamId ? `/api/teams/${teamId}` : null,
    (url) => apiFetch<Team>(url),
    { refreshInterval: 15000 },
  );

  const {
    data: questions,
    mutate: mutateQuestions,
    isLoading: loading,
  } = useSWR<QuestionsResponse>(
    teamId ? `/api/questions?team_id=${teamId}` : null,
    (url) => apiFetch<QuestionsResponse>(url),
    { refreshInterval: 15000 },
  );

  const { data: leaderboard, mutate: mutateLeaderboard } = useSWR<LeaderboardResponse>(
    teamId ? '/api/leaderboard' : null,
    (url) => apiFetch<LeaderboardResponse>(url),
    { refreshInterval: 15000 },
  );

  const submitAnswer = useCallback(
    async (questionId: string, answerText: string): Promise<AnswerResult> => {
      const result = await apiFetch<AnswerResult>('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          question_id: questionId,
          answer_text: answerText,
        }),
      });

      if (result.result === 'correct') {
        if (result.answer?.points_awarded !== undefined) {
          setPointsCache((prev) => ({ ...prev, [questionId]: result.answer.points_awarded }));
        }
        if (result.explanation) {
          setExplanationCache((prev) => ({ ...prev, [questionId]: result.explanation! }));
        }
        setIncorrectCache((prev) => {
          const next = { ...prev };
          delete next[questionId];
          return next;
        });
        mutateTeam();
        mutateQuestions();
        mutateLeaderboard();
      } else {
        setIncorrectCache((prev) => ({
          ...prev,
          [questionId]: {
            message: result.message,
            attemptCount: result.answer?.attempt_count || 1,
          },
        }));
      }

      return result;
    },
    [teamId, mutateTeam, mutateQuestions, mutateLeaderboard],
  );

  return {
    team,
    questions,
    leaderboard,
    explanationCache,
    incorrectCache,
    pointsCache,
    loading,
    submitAnswer,
  };
}
