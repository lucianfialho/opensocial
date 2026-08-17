import React from 'react';
import {AbsoluteFill} from 'remotion';
import {AccentText, Masthead, Pager, ACCENT, CREAM, INK, SANS} from './PhotoCardText';

const MONO = '"SF Mono", ui-monospace, "Cascadia Mono", Menlo, monospace';

/** Light text card: context paragraph + bold statement, cream ground. */
export const CreamCard: React.FC<{
  brand: string;
  kicker: string;
  headline: string;
  intro?: string;
  highlights?: string[];
  page?: string;
}> = ({brand, kicker, headline, intro, highlights, page}) => (
  <AbsoluteFill style={{backgroundColor: CREAM, fontFamily: SANS, justifyContent: 'center', padding: '170px 80px 120px'}}>
    <Masthead brand={brand} mode="light" />
    {intro ? (
      <div style={{color: 'rgba(20,20,18,0.82)', fontSize: 33, lineHeight: 1.5, marginBottom: 44}}>{intro}</div>
    ) : null}
    <AccentText text={headline} highlights={highlights ?? []} fontSize={intro ? 50 : 56} mode="light" />
    <div style={{color: 'rgba(20,20,18,0.55)', fontSize: 22, fontWeight: 700, letterSpacing: 5, textTransform: 'uppercase', marginTop: 44}}>
      {kicker}
    </div>
    <Pager page={page} mode="light" />
  </AbsoluteFill>
);

/** Dark long-form card: mono kicker, accent headline with underline, body
 *  paragraphs, bold closer, ghost numeral — the storytelling middle. */
export const EssayCard: React.FC<{
  brand: string;
  kicker: string;
  headline: string;
  paragraphs?: string[];
  closer?: string;
  numeral?: string;
  highlights?: string[];
  page?: string;
}> = ({brand, kicker, headline, paragraphs, closer, numeral, highlights, page}) => (
  <AbsoluteFill style={{backgroundColor: '#111110', fontFamily: SANS, justifyContent: 'center', padding: '170px 80px 120px'}}>
    {numeral ? (
      <div
        style={{
          position: 'absolute',
          top: 30,
          right: 20,
          fontSize: 420,
          fontWeight: 800,
          color: 'rgba(255,255,255,0.05)',
          lineHeight: 1,
        }}
      >
        {numeral}
      </div>
    ) : null}
    <Masthead brand={brand} mode="dark" />
    <div style={{color: 'rgba(255,255,255,0.55)', fontFamily: MONO, fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 26}}>
      {kicker}
    </div>
    <div style={{display: 'inline-block'}}>
      <AccentText text={headline} highlights={highlights ?? []} fontSize={58} mode="dark" />
      <div style={{width: 240, height: 6, backgroundColor: ACCENT, marginTop: 22, borderRadius: 3}} />
    </div>
    {(paragraphs ?? []).map((p, i) => (
      <div key={i} style={{color: 'rgba(255,255,255,0.82)', fontSize: 31, lineHeight: 1.5, marginTop: i === 0 ? 40 : 30}}>
        {p}
      </div>
    ))}
    {closer ? (
      <div style={{color: 'white', fontWeight: 800, fontSize: 31, lineHeight: 1.45, marginTop: 40}}>{closer}</div>
    ) : null}
    <Pager page={page} mode="dark" />
  </AbsoluteFill>
);

/** Closing brand card. */
export const CtaCard: React.FC<{kicker: string; headline: string}> = ({kicker, headline}) => (
  <AbsoluteFill style={{backgroundColor: '#101013', fontFamily: SANS, justifyContent: 'center', alignItems: 'center'}}>
    <div style={{textAlign: 'center', width: '100%'}}>
      <div style={{color: 'white', fontWeight: 800, fontSize: 84, textTransform: 'uppercase'}}>{headline}</div>
      <div style={{color: 'rgba(255,255,255,0.85)', fontSize: 28, letterSpacing: 4, marginTop: 20, textTransform: 'uppercase'}}>
        {kicker}
      </div>
      <div
        style={{
          display: 'inline-block',
          backgroundColor: 'white',
          color: INK,
          fontSize: 27,
          fontWeight: 800,
          padding: '16px 36px',
          borderRadius: 999,
          marginTop: 40,
        }}
      >
        Siga para mais notícias
      </div>
    </div>
  </AbsoluteFill>
);
