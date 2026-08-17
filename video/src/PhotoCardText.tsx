import {loadFont} from '@remotion/fonts';
import React from 'react';
import {staticFile} from 'remotion';

loadFont({family: 'Gofar Serif', url: staticFile('fonts/GofarSerif.otf')});

export const ACCENT = '#ffe234';
export const CREAM = '#f5f0e7';
export const INK = '#141412';
export const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, sans-serif';

/** Splits text into plain/accented segments by the highlight phrases. */
const segments = (text: string, phrases: string[]) => {
  const ranges: Array<{start: number; end: number}> = [];
  const lower = text.toLowerCase();
  for (const p of phrases) {
    const at = lower.indexOf(p.toLowerCase());
    if (at >= 0) ranges.push({start: at, end: at + p.length});
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: Array<{text: string; accent: boolean}> = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) out.push({text: text.slice(cursor, r.start), accent: false});
    out.push({text: text.slice(r.start, r.end), accent: true});
    cursor = r.end;
  }
  if (cursor < text.length) out.push({text: text.slice(cursor), accent: false});
  return out;
};

/**
 * Bold statement with the key phrases accented: yellow letters on dark
 * grounds, yellow marker chip behind black letters on light grounds.
 */
export const AccentText: React.FC<{
  text: string;
  highlights: string[];
  fontSize: number;
  mode: 'dark' | 'light';
}> = ({text, highlights, fontSize, mode}) => (
  <div
    style={{
      color: mode === 'dark' ? 'white' : INK,
      fontWeight: 800,
      fontSize,
      lineHeight: 1.16,
      letterSpacing: -1,
      textShadow: mode === 'dark' ? '0 2px 20px rgba(0,0,0,0.7)' : undefined,
    }}
  >
    {segments(text, highlights).map((s, i) =>
      s.accent ? (
        <span
          key={i}
          style={
            mode === 'dark'
              ? {color: ACCENT, textShadow: 'none'}
              : {backgroundColor: ACCENT, padding: '0 8px', borderRadius: 8, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'}
          }
        >
          {s.text}
        </span>
      ) : (
        <span key={i}>{s.text}</span>
      ),
    )}
  </div>
);

/** Magazine masthead: the Gofar wordmark, centered. */
export const Masthead: React.FC<{brand: string; mode: 'dark' | 'light'}> = ({brand, mode}) => (
  <div
    style={{
      position: 'absolute',
      top: 44,
      width: '100%',
      textAlign: 'center',
      fontFamily: '"Gofar Serif", Georgia, serif',
      fontSize: 60,
      color: mode === 'dark' ? 'white' : INK,
      textShadow: mode === 'dark' ? '0 1px 14px rgba(0,0,0,0.5)' : undefined,
    }}
  >
    {brand.replace(/\s+/g, '')}
  </div>
);

/** Bottom-corner pager, "2/5". */
export const Pager: React.FC<{page?: string; mode: 'dark' | 'light'}> = ({page, mode}) =>
  page ? (
    <div
      style={{
        position: 'absolute',
        bottom: 34,
        right: 44,
        fontSize: 24,
        fontFamily: SANS,
        color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(20,20,18,0.55)',
      }}
    >
      {page}
    </div>
  ) : null;
