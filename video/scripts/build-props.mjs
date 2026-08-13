// Maps an o agêntico event (list item + detail) to NewsReel props.
import {pickHighlights} from './pick-highlights.mjs';

const BRAND = 'o agêntico';
const CTA_HANDLE = '@oagentico';
const TAGLINE = 'o futuro da IA, todo dia, num clique';

/** Splits pt-BR prose into sentences without breaking on decimals ("2.0"). */
export const splitSentences = (text) =>
  text
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ü])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const ptDate = (iso, opts) => new Date(iso).toLocaleDateString('pt-BR', opts);

const faviconFor = (url) => {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
};

export const buildReelProps = ({story, detail, highlights, mode}) => {
  const allClaims = detail.claims ?? [];
  const articleById = new Map((detail.artigos ?? []).map((a) => [a.id, a]));
  const heroImage = story.imagem?.url
    ? {url: story.imagem.url, credit: `Foto: ${story.imagem.fonte}`}
    : null;

  const articleImages = (detail.artigos ?? [])
    .filter((a) => a.imageUrl && a.imageUrl !== heroImage?.url)
    .map((a) => ({url: a.imageUrl, credit: `Foto: ${a.sourceName}`}));

  let scenes;
  if (mode === 'claims') {
    const claimImage = (claim) => {
      const article = (claim.articleIds ?? [])
        .map((id) => articleById.get(id))
        .find((a) => a?.imageUrl);
      return article ? {url: article.imageUrl, credit: `Foto: ${article.sourceName}`} : null;
    };
    const top = allClaims
      .slice()
      .sort((a, b) => (b.articleIds?.length ?? 0) - (a.articleIds?.length ?? 0))
      .slice(0, 3);
    scenes = top.map((c, i) => ({
      label: `O fato ${i + 1}/${top.length}`,
      texto: c.texto,
      gloss: c.glossPt ?? '',
      highlights: [],
      image: claimImage(c),
    }));
  } else {
    const sentences = splitSentences(detail.summary ?? '').slice(0, 3);
    scenes = sentences.map((sentence, i) => ({
      label: `Em resumo · ${i + 1}/${sentences.length}`,
      texto: sentence,
      gloss: '',
      highlights: pickHighlights(sentence, allClaims),
      image: articleImages[i % Math.max(articleImages.length, 1)] ?? null,
    }));
  }

  return {
    kicker: 'IA & Tech',
    headline: story.title,
    highlights,
    dateline: `${ptDate(story.firstEventAt, {day: 'numeric', month: 'long', year: 'numeric'})} / ${BRAND}`,
    independentSources: story.independentSources,
    image: heroImage,
    claims: scenes,
    sources: (detail.artigos ?? []).slice(0, 6).map((a) => ({
      name: a.sourceName,
      date: a.publishedAt ? ptDate(a.publishedAt, {day: '2-digit', month: 'short'}) : '',
      favicon: faviconFor(a.canonicalUrl),
    })),
    brand: CTA_HANDLE,
    tagline: TAGLINE,
  };
};

export const buildSingleSceneProps = ({story, highlights}) => ({
  kicker: 'IA & Tech',
  headline: story.title,
  highlights,
  byline: `Apuração: ${story.independentSources} veículos independentes`,
  dateline: `${ptDate(story.firstEventAt, {day: 'numeric', month: 'long', year: 'numeric'})} / ${BRAND}`,
});
