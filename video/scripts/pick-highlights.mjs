// Picks which phrases of a headline deserve the marker, using the event's
// own reporting (claims + entities) from the o agêntico API instead of a
// blind regex.
//
// Signal 1 — entities: names that the reporting mentions across many claims
// AND that appear verbatim in the title.
// Signal 2 — claim overlap: the longest runs of title words that also appear
// in the best-supported claims (most articleIds).

const STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'e', 'em', 'no', 'na',
  'nos', 'nas', 'para', 'por', 'com', 'um', 'uma', 'ao', 'à', 'que', 'se', 'é',
]);

const tokenize = (text) => {
  const tokens = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}+.%-]*/gu;
  let m;
  while ((m = re.exec(text))) {
    tokens.push({word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length});
  }
  return tokens;
};

const entityCandidates = (title, claims) => {
  const counts = new Map();
  for (const claim of claims) {
    for (const ent of claim.entities ?? []) {
      const cur = counts.get(ent.slug) ?? {nome: ent.nome, count: 0};
      cur.count += 1;
      counts.set(ent.slug, cur);
    }
  }
  const lower = title.toLowerCase();
  return [...counts.values()]
    .filter((e) => lower.includes(e.nome.toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.nome.length >= 6) - Number(a.nome.length >= 6) ||
        b.count - a.count ||
        b.nome.length - a.nome.length,
    )
    .map((e) => e.nome);
};

const ngramCandidates = (title, claims) => {
  const titleTokens = tokenize(title);
  const spans = [];
  const topClaims = [...claims]
    .sort((a, b) => (b.articleIds?.length ?? 0) - (a.articleIds?.length ?? 0))
    .slice(0, 8);
  for (const claim of topClaims) {
    const claimWords = new Set(tokenize(claim.texto).map((t) => t.word));
    let run = [];
    const flush = () => {
      while (run.length && STOPWORDS.has(run[0].word)) run.shift();
      while (run.length && STOPWORDS.has(run[run.length - 1].word)) run.pop();
      if (run.length) {
        const text = title.slice(run[0].start, run[run.length - 1].end);
        if (text.length >= 4 || /\d/.test(text)) spans.push(text);
      }
      run = [];
    };
    for (const token of titleTokens) {
      const gapHasPunctuation =
        run.length > 0 && !/^\s*$/.test(title.slice(run[run.length - 1].end, token.start));
      if (gapHasPunctuation) flush();
      if (claimWords.has(token.word)) run.push(token);
      else flush();
    }
    flush();
  }
  return [...new Set(spans)].sort((a, b) => b.length - a.length);
};

export const pickHighlights = (title, claims, max = 2) => {
  const overlaps = (a, b) =>
    a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
  const picks = [];
  for (const candidate of [...entityCandidates(title, claims), ...ngramCandidates(title, claims)]) {
    if (picks.length >= max) break;
    if (!picks.some((p) => overlaps(p, candidate))) picks.push(candidate);
  }
  const at = (s) => title.toLowerCase().indexOf(s.toLowerCase());
  return picks.sort((a, b) => at(a) - at(b));
};
