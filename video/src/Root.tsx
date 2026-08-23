import React from 'react';
import {Composition, Still} from 'remotion';
import {ArticleHighlight} from './ArticleHighlight';
import {NewsReel, calculateNewsReelMetadata, newsReelSchema} from './NewsReel';
import {NewsSplit, calculateNewsSplitMetadata, newsSplitSchema} from './NewsSplit';
import {TweetClip, calculateTweetClipMetadata, tweetClipSchema} from './TweetClip';
import {PhotoCard, photoCardSchema} from './PhotoCard';
import {ProfilePic, profilePicSchema} from './ProfilePic';
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
  narration: null,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Still
        id="ProfilePic"
        component={ProfilePic}
        schema={profilePicSchema}
        width={1080}
        height={1080}
        defaultProps={{letter: 'o', background: 'white', color: '#101013'}}
      />
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
      {/* work stills for card design iteration (real Bitpanda content) */}
      <Still
        id="CardCover"
        component={PhotoCard}
        schema={photoCardSchema}
        width={1080}
        height={1350}
        defaultProps={{
          brand: 'o agêntico',
          handle: '@oagentico',
          kicker: 'IA & Tech',
          headline: 'A primeira multa do MiCA já saiu',
          subtitle: 'E foi a Bitpanda quem levou.',
          highlights: ['primeira multa'],
          page: '1/8',
          image: {url: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=1080', credit: 'Foto: coindesk.com'},
          variant: 'title' as const,
          fit: 'cover' as const,
        }}
      />
      <Still
        id="CardEssay"
        component={PhotoCard}
        schema={photoCardSchema}
        width={1080}
        height={1350}
        defaultProps={{
          brand: 'o agêntico',
          handle: '@oagentico',
          kicker: 'O contexto',
          headline: 'O MiCA chegou pra valer na Europa',
          highlights: ['MiCA'],
          paragraphs: [
            'A Áustria criou um marco: a primeira penalidade pública sob o novo regulamento europeu de criptoativos.',
            'O MiCA exige transparência antes de qualquer lançamento. White paper, prazos, dados de contato — tudo tem que estar certo antes de ir ao público.',
          ],
          closer: 'Não é aviso. É precedente.',
          numeral: '2',
          page: '3/8',
          image: null,
          variant: 'essay' as const,
          fit: 'cover' as const,
        }}
      />
      <Still
        id="CardCream"
        component={PhotoCard}
        schema={photoCardSchema}
        width={1080}
        height={1350}
        defaultProps={{
          brand: 'o agêntico',
          handle: '@oagentico',
          kicker: 'O peso do caso',
          headline: 'Esse é o primeiro caso público do tipo na UE',
          highlights: ['primeiro caso público'],
          intro:
            'Com o MiCA ainda recente, cada penalidade vira referência para todo o setor. Reguladores de outros países vão olhar pra esse caso antes de decidir como agir.',
          page: '6/8',
          image: null,
          variant: 'body' as const,
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
        id="NewsSplit"
        component={NewsSplit}
        schema={newsSplitSchema}
        calculateMetadata={calculateNewsSplitMetadata}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          kicker: 'IA & Tech',
          headline: 'Manchete de exemplo para o formato meia tela',
          highlights: [],
          dateline: '15 de agosto de 2026 / o agêntico',
          independentSources: 4,
          image: null,
          claims: [
            {label: 'Em resumo · 1/1', texto: 'Frase de exemplo do resumo.', image: null},
          ],
          sources: [{name: 'Veículo Um', date: '15 ago', favicon: null}],
          brand: 'o agêntico',
          tagline: 'o futuro da IA, todo dia, num clique',
          personaSrc: 'persona/news-1709-7292732b.mp4',
          narration: null,
        }}
      />
      <Composition
        id="TweetClip"
        component={TweetClip}
        schema={tweetClipSchema}
        calculateMetadata={calculateTweetClipMetadata}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          headline: 'Manchete de exemplo sobre o vídeo que está bombando',
          credit: 'via @fonte',
          videoSrc: 'persona/news-1709-vQFjkHka47-7292732b.mp4',
          videoDurationInFrames: 300,
          videoAspect: 1.33,
        }}
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
