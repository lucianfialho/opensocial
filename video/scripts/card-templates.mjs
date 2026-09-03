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
  h('div', {position: 'absolute', top: 56, left: 0, right: 0, display: 'flex', justifyContent: 'center', fontFamily: 'Gofar', fontSize: 60, color}, wordmark(brand));

const pager = (page, color) =>
  page ? h('div', {position: 'absolute', bottom: 46, right: 60, fontSize: 24, color}, page) : null;

const kickerRow = (text, color, mb = 26) =>
  h('div', {display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 6, textTransform: 'uppercase', color, marginBottom: mb}, text);

/** Entity chip: small logo + uppercase name, sits above the headline.
 *  card.entity = {nome, logoDataUri} — logo already a transparent PNG data URI. */
const entityChip = (entity, mode = 'dark') =>
  entity
    ? h(
        'div',
        {
          display: 'flex', alignItems: 'center', alignSelf: 'flex-start',
          backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(20,20,18,0.07)',
          borderRadius: 40, padding: '10px 26px 10px 14px', marginBottom: 30, gap: 14,
        },
        entity.logoDataUri
          ? {type: 'img', props: {src: entity.logoDataUri, width: 44, height: 44, style: {width: 44, height: 44, objectFit: 'contain'}}}
          : null,
        h('div', {
          display: 'flex', fontSize: 27, fontWeight: 700, letterSpacing: 5,
          textTransform: 'uppercase', color: mode === 'dark' ? 'rgba(255,255,255,0.92)' : INK,
        }, entity.nome),
      )
    : null;

/** Statement with accent phrases: yellow letters (dark) or yellow chip (light). */
const accented = (text, highlights, fontSize, mode, extra = {}) => {
  const ranges = [];
  const lower = text.toLowerCase();
  for (const p of highlights ?? []) {
    const at = lower.indexOf(p.toLowerCase());
    if (at >= 0) ranges.push({start: at, end: at + p.length});
  }
  const color = mode === 'dark' ? 'white' : INK;
  // Word-level flex items, every span shaped "word + trailing space": no
  // leading spaces means wrapped lines all start flush left, and accent
  // chips still form a continuous marker band across their words. Tokens
  // come from the ORIGINAL text so punctuation stays glued to its word; a
  // token is accented when it overlaps any highlight range.
  const words = [];
  let cursor = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const start = text.indexOf(token, cursor);
    const end = start + token.length;
    cursor = end;
    const accent = ranges.some((r) => start < r.end && end > r.start);
    words.push({word: token, accent});
  }
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
const fitHeadline = (text, width = 912) => {
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
  card.image ? h('div', {position: 'absolute', top: 30, left: 32, fontSize: 17, color: 'rgba(255,255,255,0.62)'}, `* ${card.image.credit.replace(/^Foto: /, '')}`) : null;

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
        {position: 'absolute', left: 84, right: 84, bottom: 104, display: 'flex', flexDirection: 'column'},
        entityChip(card.entity),
        accented(card.headline, card.highlights, fitHeadline(card.headline), 'dark', {
          lineHeight: 1.04,
          letterSpacing: -3,
        }),
        card.subtitle
          ? h('div', {display: 'flex', fontSize: 40, fontWeight: 400, lineHeight: 1.35, color: 'rgba(255,255,255,0.92)', marginTop: 28}, card.subtitle)
          : null,
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    ),

  // landscape cover: the photo runs as a full-width band at its natural
  // aspect (no crop, no scrim over the subject); headline gets its own zone
  titleBand: (card) => {
    const ratio = card.image?.ratio ?? 1.5;
    const bandH = Math.min(760, Math.round(1080 / ratio));
    const bandTop = 176;
    return shell(
      '#101013',
      masthead(card.brand, 'white'),
      {
        type: 'img',
        props: {
          src: card.image.dataUri,
          width: 1080,
          height: bandH,
          style: {position: 'absolute', top: bandTop, left: 0, width: 1080, height: bandH, objectFit: 'cover'},
        },
      },
      h('div', {position: 'absolute', top: bandTop + bandH - 42, left: 26, fontSize: 17, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 8px rgba(0,0,0,0.65)'}, `* ${card.image.credit.replace(/^Foto: /, '')}`),
      h(
        'div',
        {position: 'absolute', left: 84, right: 84, bottom: 104, display: 'flex', flexDirection: 'column'},
        entityChip(card.entity),
        accented(card.headline, card.highlights, fitHeadline(card.headline), 'dark', {
          lineHeight: 1.04,
          letterSpacing: -3,
        }),
        card.subtitle
          ? h('div', {display: 'flex', fontSize: 40, fontWeight: 400, lineHeight: 1.35, color: 'rgba(255,255,255,0.92)', marginTop: 28}, card.subtitle)
          : null,
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    );
  },

  body: (card) =>
    shell(
      '#101013',
      photoLayer(card),
      scrim(),
      masthead(card.brand, 'white'),
      credit(card),
      h(
        'div',
        {position: 'absolute', left: 84, right: 84, bottom: 104, display: 'flex', flexDirection: 'column'},
        kickerRow(card.kicker, 'rgba(255,255,255,0.8)', 18),
        accented(card.headline, card.highlights, Math.min(92, fitHeadline(card.headline, 912)), 'dark', {lineHeight: 1.08, letterSpacing: -2}),
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    ),

  // landscape body: same band treatment as titleBand, with the kicker
  bodyBand: (card) => {
    const ratio = card.image?.ratio ?? 1.5;
    const bandH = Math.min(760, Math.round(1080 / ratio));
    const bandTop = 176;
    return shell(
      '#101013',
      masthead(card.brand, 'white'),
      {
        type: 'img',
        props: {
          src: card.image.dataUri,
          width: 1080,
          height: bandH,
          style: {position: 'absolute', top: bandTop, left: 0, width: 1080, height: bandH, objectFit: 'cover'},
        },
      },
      h('div', {position: 'absolute', top: bandTop + bandH - 42, left: 26, fontSize: 17, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 8px rgba(0,0,0,0.65)'}, `* ${card.image.credit.replace(/^Foto: /, '')}`),
      h(
        'div',
        {position: 'absolute', left: 84, right: 84, bottom: 104, display: 'flex', flexDirection: 'column'},
        kickerRow(card.kicker, 'rgba(255,255,255,0.8)', 18),
        accented(card.headline, card.highlights, Math.min(92, fitHeadline(card.headline, 912)), 'dark', {lineHeight: 1.08, letterSpacing: -2}),
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    );
  },

  essay: (card) =>
    shell(
      '#111110',
      card.numeral
        ? h('div', {position: 'absolute', top: 10, right: 20, fontSize: 420, fontWeight: 800, color: 'rgba(255,255,255,0.05)'}, card.numeral)
        : null,
      masthead(card.brand, 'white'),
      h(
        'div',
        {display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '190px 88px 150px'},
        kickerRow(card.kicker, 'rgba(255,255,255,0.55)', 30),
        accented(card.headline, card.highlights, Math.min(88, fitHeadline(card.headline, 904)), 'dark', {lineHeight: 1.08, letterSpacing: -2}),
        h('div', {display: 'flex', width: 280, height: 7, backgroundColor: ACCENT, marginTop: 28, borderRadius: 4}),
        ...(card.paragraphs ?? []).map((p, i) =>
          h('div', {display: 'flex', fontSize: 37, lineHeight: 1.5, color: 'rgba(255,255,255,0.84)', marginTop: i === 0 ? 52 : 36}, p),
        ),
        card.closer ? h('div', {display: 'flex', fontSize: 38, fontWeight: 800, lineHeight: 1.4, color: 'white', marginTop: 52}, card.closer) : null,
      ),
      pager(card.page, 'rgba(255,255,255,0.7)'),
    ),

  cream: (card) =>
    shell(
      CREAM,
      masthead(card.brand, INK),
      h(
        'div',
        {display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '190px 88px 150px'},
        kickerRow(card.kicker, 'rgba(20,20,18,0.55)', 34),
        card.intro
          ? h('div', {display: 'flex', fontSize: 40, lineHeight: 1.5, color: 'rgba(20,20,18,0.85)', marginBottom: 56}, card.intro)
          : null,
        accented(card.headline, card.highlights, card.intro ? 64 : Math.min(96, fitHeadline(card.headline, 904)), 'light', {lineHeight: 1.15}),
      ),
      pager(card.page, 'rgba(20,20,18,0.55)'),
    ),

  cta: (card) =>
    shell(
      '#101013',
      h(
        'div',
        {display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', alignItems: 'center'},
        h('div', {display: 'flex', fontFamily: 'Gofar', fontSize: 150, color: 'white'}, wordmark(card.brand)),
        h('div', {display: 'flex', fontSize: 28, letterSpacing: 4, color: 'rgba(255,255,255,0.85)', marginTop: 24, textTransform: 'uppercase'}, card.kicker),
        h('div', {display: 'flex', backgroundColor: 'white', color: INK, fontSize: 27, fontWeight: 800, padding: '16px 36px', borderRadius: 999, marginTop: 40}, 'Siga para mais notícias'),
      ),
    ),
};
