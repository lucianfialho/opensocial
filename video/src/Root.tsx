import React from 'react';
import {Composition} from 'remotion';
import {ArticleHighlight} from './ArticleHighlight';
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

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
