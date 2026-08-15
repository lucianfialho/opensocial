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
 * Full-bleed photo for the top half of NewsSplit: slow Ken Burns zoom,
 * license credit always visible. The captions carry the words; the
 * slider carries only images.
 */
export const SplitImage: React.FC<{
  image: CreditedImage;
  zoom?: 'in' | 'out';
}> = ({image, zoom = 'in'}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scale =
    zoom === 'in'
      ? interpolate(frame, [0, durationInFrames], [1, 1.08])
      : interpolate(frame, [0, durationInFrames], [1.08, 1]);
  return (
    <AbsoluteFill style={{backgroundColor: '#101013', overflow: 'hidden'}}>
      <Img
        src={image.url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 14,
          bottom: 14,
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
      paddingTop: 160,
      fontFamily: FONT_UI,
    }}
  >
    <div style={{fontFamily: '"Gofar Serif", Georgia, serif', fontSize: 120, color: '#101013'}}>
      {brand}
    </div>
    <div style={{fontSize: 32, color: '#555', marginTop: 14, letterSpacing: 2}}>
      {tagline}
    </div>
    <div
      style={{
        marginTop: 34,
        fontSize: 32,
        fontWeight: 700,
        backgroundColor: '#101013',
        color: 'white',
        padding: '16px 34px',
        borderRadius: 44,
      }}
    >
      Siga @oagentico
    </div>
  </AbsoluteFill>
);
