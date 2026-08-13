import React from 'react';
import {Composition, Still} from 'remotion';
import {ArticleHighlight} from './ArticleHighlight';
import {NewsReel, calculateNewsReelMetadata, newsReelSchema} from './NewsReel';
import {PhotoCard, photoCardSchema} from './PhotoCard';
import {TextArticle, textArticleSchema} from './TextArticle';

const DEFAULT_PROPS = {
  kicker: 'Analytics',
  headline:
    'Atribuição de último clique esconde o impacto real da mídia, mostra estudo',
  highlights: ['último clique', 'impacto real'],
  byline: 'Por Lucian Fialho',
  dateline: 'Atualizado em: 12 de agosto de 2026 / Anti Achismo Social Club',
};

const FORMATS = [
  {id: 'ArticleText', width: 1920, height: 1080}, // 16:9 — YouTube, X
  {id: 'ArticleTextPortrait', width: 1080, height: 1350}, // 4:5 — feed/carrossel IG
  {id: 'ArticleTextSquare', width: 1080, height: 1080}, // 1:1
  {id: 'ArticleTextReel', width: 1080, height: 1920}, // 9:16 — Reels/TikTok/Stories
] as const;

const NEWS_REEL_DEFAULTS = {
  kicker: 'IA & Tech',
  headline: 'Manchete de exemplo com duas frases marcadas pela apuração',
  highlights: ['duas frases marcadas'],
  dateline: '12 de agosto de 2026 / o agêntico',
  independentSources: 4,
  image: null,
  claims: [
    {label: 'Em resumo · 1/2', texto: 'Primeira frase do resumo, com um número: 42%.', gloss: '', highlights: [], image: null},
    {label: 'Em resumo · 2/2', texto: 'Segunda frase do resumo editorial.', gloss: '', highlights: [], image: null},
  ],
  sources: [
    {name: 'Veículo Um', date: '10 ago', favicon: null},
    {name: 'Veículo Dois', date: '10 ago', favicon: null},
  ],
  brand: 'o agêntico',
  tagline: 'só o que duas fontes independentes confirmam',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Still
        id="PhotoCard"
        component={PhotoCard}
        schema={photoCardSchema}
        width={1080}
        height={1350}
        defaultProps={{
          brand: 'o agêntico',
          handle: '@oagentico',
          kicker: 'IA & Tech',
          headline: 'Manchete de exemplo em caixa alta sobre a foto',
          image: null,
          variant: 'title' as const,
          fit: 'cover' as const,
        }}
      />
      <Composition
        id="NewsReel"
        component={NewsReel}
        schema={newsReelSchema}
        calculateMetadata={calculateNewsReelMetadata}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={NEWS_REEL_DEFAULTS}
      />
      <Composition
        id="NewsReelPortrait"
        component={NewsReel}
        schema={newsReelSchema}
        calculateMetadata={calculateNewsReelMetadata}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={NEWS_REEL_DEFAULTS}
      />
      <Composition
        id="ArticleHighlight"
        component={ArticleHighlight}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      {FORMATS.map((format) => (
        <Composition
          key={format.id}
          id={format.id}
          component={TextArticle}
          schema={textArticleSchema}
          durationInFrames={150}
          fps={30}
          width={format.width}
          height={format.height}
          defaultProps={DEFAULT_PROPS}
        />
      ))}
    </>
  );
};
