import React from 'react';
import {AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CreditedImage} from '../ImageWithCredit';

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, sans-serif';

/** CTA closing: hero image blurred behind, follow pill + handle + tagline. */
export const ClosingScene: React.FC<{
  brand: string;
  tagline: string;
  image: CreditedImage | null;
  durationInFrames: number;
}> = ({brand, tagline, image}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = (delay: number) =>
    spring({frame: frame - delay, fps, config: {damping: 200}});

  const pill = pop(10);
  const handle = pop(0);
  const tag = pop(18);

  return (
    <AbsoluteFill style={{backgroundColor: '#101013', fontFamily: SANS}}>
      {image ? (
        <Img
          src={image.url}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(26px) brightness(0.4)',
            transform: 'scale(1.1)',
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}
      >
        <div
          style={{
            backgroundColor: 'white',
            color: '#101013',
            fontSize: 30,
            fontWeight: 800,
            padding: '18px 40px',
            borderRadius: 999,
            marginBottom: 44,
            opacity: pill,
            transform: `scale(${0.8 + pill * 0.2})`,
          }}
        >
          Siga para mais notícias
        </div>
        <div
          style={{
            color: 'white',
            fontSize: 100,
            fontWeight: 800,
            textTransform: 'uppercase',
            opacity: handle,
            transform: `translateY(${(1 - handle) * 40}px)`,
          }}
        >
          {brand}
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.92)',
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 7,
            textTransform: 'uppercase',
            marginTop: 30,
            opacity: tag,
            maxWidth: 900,
          }}
        >
          {tagline}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
