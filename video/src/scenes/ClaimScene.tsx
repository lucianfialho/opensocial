import React from 'react';
import {ImageWithCredit, type CreditedImage} from '../ImageWithCredit';
import {HeadlineWithHighlights} from '../TextArticle';
import {SlideStage} from './SlideStage';

/** Number-ish expressions ("30B", "120K+", "20%", "2026") get the marker. */
const numberPhrases = (text: string): string[] => {
  const matches = [...text.matchAll(/\d+(?:[.,]\d+)?\s?[KMB]?\+?%?/g)]
    .map((m) => m[0].trim())
    .filter((n) => n.length >= 2);
  return [...new Set(matches)].slice(0, 2);
};

export const ClaimScene: React.FC<{
  label: string;
  texto: string;
  gloss: string;
  highlights?: string[];
  image: CreditedImage | null;
  durationInFrames: number;
  direction?: 'up' | 'right' | 'left';
}> = ({label, texto, gloss, highlights, image, direction}) => {
  return (
    <SlideStage direction={direction}>
      <div
        style={{
          backgroundColor: 'white',
          padding: '96px 110px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {image ? <ImageWithCredit image={image} height={380} /> : null}
        <div
          style={{
            fontSize: 28,
            color: '#555',
            textDecoration: 'underline',
            textUnderlineOffset: 6,
            marginBottom: 28,
          }}
        >
          {label}
        </div>
        <HeadlineWithHighlights
          headline={texto}
          highlights={highlights && highlights.length > 0 ? highlights : numberPhrases(texto)}
          fontSize={56}
          highlightStartAt={18}
        />
        {gloss ? (
          <div style={{fontSize: 32, color: '#555', marginTop: 34, lineHeight: 1.5}}>
            <span style={{fontWeight: 600, color: '#333'}}>Por que importa: </span>
            {gloss}
          </div>
        ) : null}
      </div>
    </SlideStage>
  );
};
