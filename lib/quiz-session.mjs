// Page-memory only: no storage, URLs, network, or shared state between tabs.
export function createQuizSessions(seasons) {
  const sessions = new Map();
  return {
    get(seasonId) { return sessions.get(seasonId) ?? null; },
    begin(seasonId, restart = false) {
      if (!Object.hasOwn(seasons, seasonId)) throw new Error('未知季别');
      if (restart || !sessions.has(seasonId)) {
        sessions.set(seasonId, { seasonId, index: 0, answers: {}, result: null });
      }
      return sessions.get(seasonId);
    },
  };
}
