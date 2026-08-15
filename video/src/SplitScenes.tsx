import React from 'react';
import {AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {HeadlineWithHighlights} from './TextArticle';
import {ImageWithCredit, type CreditedImage} from './ImageWithCredit';
import type {SourceItem} from './scenes/SourcesScene';

const FONT_UI =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/** Compact scene card for the top half of NewsSplit: slides in, no 3D. */
const HalfCard: React.FC<{children: React.ReactNode; direction?: 'right' | 'left'}> = ({
  children,
  direction = 'right',
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 200}, durationInFrames: 20});
  const offset = (1 - enter) * 70 * (direction === 'right' ? 1 : -1);
  return (
    <AbsoluteFill style={{backgroundColor: 'white', fontFamily: FONT_UI}}>
      <div
        style={{
          padding: '310px 90px 30px',
          opacity: enter,
          transform: `translateX(${offset}px)`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{children: string}> = ({children}) => (
  <div
    style={{
      fontSize: 26,
      color: '#555',
      textDecoration: 'underline',
      textUnderlineOffset: 6,
      marginBottom: 20,
    }}
  >
    {children}
  </div>
);

export const SplitHook: React.FC<{
  kicker: string;
  headline: string;
  highlights: string[];
  dateline: string;
  independentSources: number;
  image: CreditedImage | null;
}> = ({kicker, headline, highlights, dateline, independentSources, image}) => (
  <HalfCard direction="right">
    {image ? <ImageWithCredit image={image} height={250} /> : null}
    <Kicker>{kicker}</Kicker>
    <HeadlineWithHighlights headline={headline} highlights={highlights} fontSize={46} />
    <div style={{fontSize: 24, color: '#333', marginTop: 20}}>
      {`Apuração: ${independentSources} veículos independentes · ${dateline}`}
    </div>
  </HalfCard>
);

export const SplitClaim: React.FC<{
  label: string;
  texto: string;
  image: CreditedImage | null;
  direction?: 'right' | 'left';
}> = ({label, texto, image, direction}) => (
  <HalfCard direction={direction}>
    {image ? <ImageWithCredit image={image} height={230} /> : null}
    <Kicker>{label}</Kicker>
    <HeadlineWithHighlights headline={texto} highlights={[]} fontSize={image ? 42 : 50} />
  </HalfCard>
);

export const SplitSources: React.FC<{
  independentSources: number;
  sources: SourceItem[];
}> = ({independentSources, sources}) => {
  const phrase = `${independentSources} veículos independentes`;
  return (
    <HalfCard direction="right">
      <Kicker>A apuração</Kicker>
      <HeadlineWithHighlights
        headline={`Confirmado por ${phrase}`}
        highlights={[phrase]}
        fontSize={48}
        highlightStartAt={10}
      />
      <div style={{display: 'flex', flexWrap: 'wrap', gap: '14px 30px', marginTop: 26}}>
        {sources.slice(0, 6).map((source, i) => (
          <div
            key={`${source.name}-${i}`}
            style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 27, color: '#333'}}
          >
            {source.favicon ? (
              <Img
                src={source.favicon}
                style={{width: 34, height: 34, borderRadius: 7, display: 'block'}}
              />
            ) : (
              <div style={{width: 34, height: 34, borderRadius: 7, backgroundColor: '#eee'}} />
            )}
            <span style={{fontWeight: 600}}>{source.name}</span>
          </div>
        ))}
      </div>
    </HalfCard>
  );
};

export const SplitClosing: React.FC<{brand: string; tagline: string}> = ({
  brand,
  tagline,
}) => (
  <HalfCard direction="left">
    <div style={{fontFamily: '"Gofar Serif", Georgia, serif', fontSize: 110, color: '#101013'}}>
      {brand}
    </div>
    <div style={{fontSize: 34, color: '#555', marginTop: 18, letterSpacing: 2}}>
      {tagline}
    </div>
    <div
      style={{
        display: 'inline-block',
        marginTop: 30,
        fontSize: 30,
        fontWeight: 700,
        backgroundColor: '#101013',
        color: 'white',
        padding: '14px 30px',
        borderRadius: 40,
      }}
    >
      Siga @oagentico
    </div>
  </HalfCard>
);
