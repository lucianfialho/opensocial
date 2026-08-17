// Card templates for the satori engine: plain object trees, flexbox only.
// Design language: Gofar masthead, Inter statements with brand-yellow
// accents, Lora serif subtitles, cream/dark grounds.
const ACCENT = '#ffe234';
const CREAM = '#f5f0e7';
const INK = '#141412';

const h = (type, style, ...children) => {
  const kids = children.filter((c) => c !== null && c !== undefined);
  // satori requires explicit display:flex on any div with multiple children
  const resolved = type === 'div' && !style.display ? {display: 'flex', ...style} : style;
  return {type, props: {style: resolved, children: kids.length === 1 ? kids[0] : kids}};
};

const wordmark = (brand) => brand.replace(/\s+/g, '');

const masthead = (brand, color) =>
  h('div', {position: 'absolute', top: 44, left: 0, right: 0, display: 'flex', justifyContent: 'center', fontFamily: 'Gofar', fontSize: 60, color}, wordmark(brand));

const pager = (page, color) =>
  page ? h('div', {position: 'absolute', bottom: 34, right: 44, fontSize: 24, color}, page) : null;

const kickerRow = (text, color, mb = 26) =>
  h('div', {display: 'flex', fontSize: 23, fontWeight: 700, letterSpacing: 5, textTransform: 'uppercase', color, marginBottom: mb}, text);

/** Statement with accent phrases: yellow letters (dark) or yellow chip (light). */
const accented = (text, highlights, fontSize, mode, extra = {}) => {
  const spans = [];
  let rest = text;
  for (const p of highlights ?? []) {
    const at = rest.toLowerCase().indexOf(p.toLowerCase());
    if (at < 0) continue;
    if (at > 0) spans.push({text: rest.slice(0, at), accent: false});
    spans.push({text: rest.slice(at, at + p.length), accent: true});
    rest = rest.slice(at + p.length);
  }
  spans.push({text: rest, accent: false});
  const color = mode === 'dark' ? 'white' : INK;
  // Word-level flex items, every span shaped "word + trailing space": no
  // leading spaces means wrapped lines all start flush left, and accent
  // chips still form a continuous marker band across their words.
  const words = spans.flatMap((s) =>
    s.text.split(/\s+/).filter(Boolean).map((word) => ({word, accent: s.accent})),
  );
  return h(
    'div',
    {display: 'flex', flexWrap: 'wrap', fontWeight: 800, fontSize, lineHeight: 1.25, letterSpacing: -1, color, ...extra},
    ...words.map(({word, accent}, i) =>
      h(
        'span',
        accent
          ? mode === 'dark'
            ? {color: ACCENT, whiteSpace: 'pre'}
            : {backgroundColor: ACCENT, whiteSpace: 'pre', padding: '2px 0'}
          : {whiteSpace: 'pre'},
        i < words.length - 1 ? `${word} ` : word,
      ),
    ),
  );
};

/**
 * Cover-headline sizing rule: pick a target line count from the character
 * count (short titles = 2 fat lines, long ones = 4), then size the font so
 * those lines fill the column width. k ≈ average Inter-800 glyph width.
 */
const fitHeadline = (text, width = 956) => {
  const len = text.length;
  const lines = len <= 40 ? 2 : len <= 75 ? 3 : 4;
  const k = 0.52;
  const size = Math.round((width * lines) / (k * len));
  return Math.max(62, Math.min(112, size));
};

const photoLayer = (card) => ({
  type: 'img',
  props: {
    src: card.image.dataUri,
    width: 1080,
    height: 1350,
    style: {position: 'absolute', top: 0, left: 0, width: 1080, height: 1350, objectFit: 'cover'},
  },
});

const scrim = () =>
  h('div', {position: 'absolute', top: 0, left: 0, width: 1080, height: 1350, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 26%, rgba(0,0,0,0.25) 48%, rgba(0,0,0,0.88) 72%, rgba(0,0,0,0.97) 100%)'});

const credit = (card) =>
  card.image ? h('div', {position: 'absolute', top: 20, left: 22, fontSize: 17, color: 'rgba(255,255,255,0.62)'}, `* ${card.image.credit.replace(/^Foto: /, '')}`) : null;

const shell = (bg, ...children) =>
  h('div', {display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: bg, fontFamily: 'Inter', position: 'relative'}, ...children.filter(Boolean));

export const templates = {
  title: (card) =>
    shell(
      '#101013',
      photoLayer(card),
      scrim(),
      masthead(card.brand, 'white'),
      credit(card),
      h(
        'div',
        {position: 'absolute', left: 64, right: 50, bottom: 76, display: 'flex', flexDirection: 'column'},
        accented(card.headline, card.highlights, fitHeadline(card.headline), 'dark', {
          lineHeight: 1.04,
          letterSpacing: -3,
        }),
        card.subtitle
          ? h('div', {display: 'flex', fontSize: 31, fontWeight: 400, lineHeight: 1.35, color: 'rgba(255,255,255,0.85)', marginTop: 26}, card.subtitle)
          : null,
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    ),

  body: (card) =>
    shell(
      '#101013',
      photoLayer(card),
      scrim(),
      masthead(card.brand, 'white'),
      credit(card),
      h(
        'div',
        {position: 'absolute', left: 60, right: 60, bottom: 70, display: 'flex', flexDirection: 'column'},
        kickerRow(card.kicker, 'rgba(255,255,255,0.8)', 18),
        accented(card.headline, card.highlights, card.headline.length > 160 ? 44 : 54, 'dark'),
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    ),

  essay: (card) =>
    shell(
      '#111110',
      card.numeral
        ? h('div', {position: 'absolute', top: 10, right: 20, fontSize: 420, fontWeight: 800, color: 'rgba(255,255,255,0.05)'}, card.numeral)
        : null,
      masthead(card.brand, 'white'),
      h(
        'div',
        {display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '170px 80px 120px'},
        kickerRow(card.kicker, 'rgba(255,255,255,0.55)'),
        accented(card.headline, card.highlights, 60, 'dark'),
        h('div', {display: 'flex', width: 240, height: 6, backgroundColor: ACCENT, marginTop: 24, borderRadius: 3}),
        ...(card.paragraphs ?? []).map((p, i) =>
          h('div', {display: 'flex', fontSize: 31, lineHeight: 1.5, color: 'rgba(255,255,255,0.82)', marginTop: i === 0 ? 42 : 30}, p),
        ),
        card.closer ? h('div', {display: 'flex', fontSize: 31, fontWeight: 800, lineHeight: 1.45, color: 'white', marginTop: 42}, card.closer) : null,
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    ),

  cream: (card) =>
    shell(
      CREAM,
      masthead(card.brand, INK),
      h(
        'div',
        {display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '170px 76px 140px'},
        kickerRow(card.kicker, 'rgba(20,20,18,0.55)', 34),
        card.intro
          ? h('div', {display: 'flex', fontSize: 36, lineHeight: 1.45, color: 'rgba(20,20,18,0.85)', marginBottom: 48}, card.intro)
          : null,
        accented(card.headline, card.highlights, card.intro ? 58 : card.headline.length > 80 ? 66 : 84, 'light'),
      ),
      pager(card.page, 'rgba(20,20,18,0.55)'),
    ),

  cta: (card) =>
    shell(
      '#101013',
      h(
        'div',
        {display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', alignItems: 'center'},
        h('div', {display: 'flex', fontSize: 84, fontWeight: 800, color: 'white', textTransform: 'uppercase'}, card.headline),
        h('div', {display: 'flex', fontSize: 28, letterSpacing: 4, color: 'rgba(255,255,255,0.85)', marginTop: 20, textTransform: 'uppercase'}, card.kicker),
        h('div', {display: 'flex', backgroundColor: 'white', color: INK, fontSize: 27, fontWeight: 800, padding: '16px 36px', borderRadius: 999, marginTop: 40}, 'Siga para mais notícias'),
      ),
    ),
};
