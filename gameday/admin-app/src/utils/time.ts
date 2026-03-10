export function getElapsedMinutes(startedAt: string | null): number {
  return startedAt ? (Date.now() - new Date(startedAt).getTime()) / 60000 : 0;
}
