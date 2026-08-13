import React from 'react';
import {z} from 'zod';
import {ArticleMotion, useHighlightProgress} from './ArticleMotion';
import {HighlightSpan} from './HighlightSpan';
import {ImageWithCredit, type CreditedImage} from './ImageWithCredit';

export const textArticleSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  highlights: z.array(z.string()),
  byline: z.string(),
  dateline: z.string(),
});

export type TextArticleProps = z.infer<typeof textArticleSchema>;

interface Segment {
  text: string;
  highlightIndex: number | null;
}

/** Splits the headline into plain and highlighted segments, in phrase order. */
const segmentHeadline = (headline: string, phrases: string[]): Segment[] => {
  const ranges: Array<{start: number; end: number; index: number}> = [];
  const lower = headline.toLowerCase();
  phrases.forEach((phrase, index) => {
    const at = lower.indexOf(phrase.toLowerCase());
    if (at >= 0) ranges.push({start: at, end: at + phrase.length, index});
  });
  ranges.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({text: headline.slice(cursor, range.start), highlightIndex: null});
    }
    segments.push({text: headline.slice(range.start, range.end), highlightIndex: range.index});
    cursor = range.end;
  }
  if (cursor < headline.length) {
    segments.push({text: headline.slice(cursor), highlightIndex: null});
  }
  return segments;
};

const Highlighted: React.FC<{index: number; text: string; startAt?: number}> = ({
  index,
  text,
  startAt,
}) => {
  const progress = useHighlightProgress(index, startAt);
  return (
    <HighlightSpan progress={progress} seed={42 + index}>
      {text}
    </HighlightSpan>
  );
};

export const HeadlineWithHighlights: React.FC<{
  headline: string;
  highlights: string[];
  fontSize?: number;
  highlightStartAt?: number;
}> = ({headline, highlights, fontSize = 58, highlightStartAt}) => {
  const segments = segmentHeadline(headline, highlights);
  return (
    <h1
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize,
        lineHeight: 1.3,
        fontWeight: 700,
        color: '#151515',
        margin: 0,
      }}
    >
      {segments.map((seg, i) =>
        seg.highlightIndex === null ? (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ) : (
          <Highlighted key={i} index={seg.highlightIndex} text={seg.text} startAt={highlightStartAt} />
        ),
      )}
    </h1>
  );
};

export const TextArticle: React.FC<
  TextArticleProps & {
    sweepDurationInFrames?: number;
    image?: CreditedImage | null;
  }
> = ({kicker, headline, highlights, byline, dateline, sweepDurationInFrames, image}) => {
  return (
    <ArticleMotion sweepDurationInFrames={sweepDurationInFrames}>
      <div
        style={{
          backgroundColor: 'white',
          padding: '96px 110px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {image ? <ImageWithCredit image={image} height={520} /> : null}
        <div
          style={{
            fontSize: 28,
            color: '#555',
            textDecoration: 'underline',
            textUnderlineOffset: 6,
            marginBottom: 28,
          }}
        >
          {kicker}
        </div>
        <HeadlineWithHighlights headline={headline} highlights={highlights} />
        <div style={{fontSize: 28, color: '#333', marginTop: 34}}>{byline}</div>
        <div style={{fontSize: 26, color: '#666', marginTop: 14}}>{dateline}</div>
      </div>
    </ArticleMotion>
  );
};
