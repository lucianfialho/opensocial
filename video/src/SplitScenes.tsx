import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {CreditedImage} from './ImageWithCredit';

const FONT_UI =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/**
 * Photo card for the top half of NewsSplit: the image keeps its own
 * aspect (no cover crop) inside a rounded card, gently floating.
 * License credit always visible. Captions carry the words.
 */
export const SplitImage: React.FC<{
  image: CreditedImage;
  zoom?: 'in' | 'out';
}> = ({image, zoom = 'in'}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scale =
    zoom === 'in'
      ? interpolate(frame, [0, durationInFrames], [1, 1.04])
      : interpolate(frame, [0, durationInFrames], [1.04, 1]);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 150,
      }}
    >
      <div
        style={{
          position: 'relative',
          transform: `scale(${scale})`,
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
          borderRadius: 22,
        }}
      >
        <Img
          src={image.url}
          style={{
            display: 'block',
            maxWidth: 880,
            maxHeight: 620,
            borderRadius: 22,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            fontSize: 19,
            color: '#333',
            backgroundColor: 'rgba(255,255,255,0.88)',
            padding: '5px 12px',
            borderRadius: 7,
            fontFamily: FONT_UI,
          }}
        >
          {image.credit}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Closing card: brand logo + follow pill (no narration duplication). */
export const SplitClosing: React.FC<{brand: string; tagline: string}> = ({
  brand,
  tagline,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: 'white',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: FONT_UI,
    }}
  >
    <div
      style={{
        width: '100%',
        textAlign: 'center',
        fontFamily: '"Gofar Serif", Georgia, serif',
        fontSize: 120,
        color: '#101013',
      }}
    >
      {brand}
    </div>
    <div
      style={{
        width: '100%',
        textAlign: 'center',
        fontSize: 32,
        color: '#555',
        marginTop: 14,
        letterSpacing: 2,
      }}
    >
      {tagline}
    </div>
    <div style={{width: '100%', textAlign: 'center', marginTop: 34}}>
      <span
        style={{
          display: 'inline-block',
          fontSize: 32,
          fontWeight: 700,
          backgroundColor: '#101013',
          color: 'white',
          padding: '16px 34px',
          borderRadius: 44,
        }}
      >
        Siga @oagentico
      </span>
    </div>
  </AbsoluteFill>
);
