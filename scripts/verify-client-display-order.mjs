/**
 * Reconstruct the observed PINNED public client's deterministic question order
 * from source-array positions, without copying Korean questions or collecting
 * a single official answer. This checks source-index order independently of
 * its own frozen metadata hash. It does NOT test browser branching, server
 * scoring, cross-version stability, or translation rights.
 *
 * Evidence: SHA-256 59a67f9d...b379e (331501 bytes); the public client
 * derives a season-named unsigned 32-bit seed and uses a reverse Fisher-Yates
 * pass with an LCG. Verify the client hash separately before trusting this.
 */
export function reconstructedClientOrder(questions, season) {
  if (![1, 2].includes(season) || !Array.isArray(questions)) {
    throw new Error('客户端题序：非法季别或源题集合');
  }
  const count = season === 1 ? 87 : 37;
  const rows = questions.filter(q => q?.season === season);
  const positions = rows.map(q => q.sourceArrayPosition);
  if (rows.length !== count || new Set(positions).size !== count ||
      positions.some(n => !Number.isInteger(n) || n < 1 || n > count) ||
      new Set(rows.map(q => q.sourceQuestionId)).size !== count) {
    throw new Error('客户端题序：源题顺序必须覆盖当前季别且唯一');
  }
  const ordered = rows.slice().sort((a, b) => a.sourceArrayPosition - b.sourceArrayPosition);
  // Source seed hashes the ASCII "season-1" / "season-2" string by UTF-16 code unit.
  let seed = 2166136261;
  const key = `season-${season}`;
  for (let i = 0; i < key.length; i++) {
    seed = Math.imul(seed ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  seed ||= 1;
  for (let index = ordered.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swap = seed % (index + 1);
    [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
  }
  return ordered.map(q => q.sourceQuestionId);
}

export function verifyClientDisplayOrder(index) {
  if (!Array.isArray(index?.questions) || index.questions.length !== 124) {
    throw new Error('客户端题序：缺少两季源题');
  }
  for (const season of [1, 2]) {
    const ordered = reconstructedClientOrder(index.questions, season);
    const actual = new Map(index.questions.filter(q => q.season === season)
      .map(q => [q.sourceQuestionId, q.displayPositionDerivedFromClient]));
    for (const [i, id] of ordered.entries()) {
      if (actual.get(id) !== i + 1) {
        throw new Error('客户端题序：冻结的展示位置与当前已观察的定种子洗牌规则不符');
      }
    }
  }
  return true;
}
