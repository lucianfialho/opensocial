import React from 'react';
import {AbsoluteFill, Img} from 'remotion';

export interface CardImage {
  url: string;
  credit: string;
}

/** Image layers + gradient scrim behind a PhotoCard's content. */
export const PhotoCardBackground: React.FC<{
  image: CardImage | null;
  fit: 'cover' | 'contain';
  variant: 'title' | 'body' | 'cta';
}> = ({image, fit, variant}) => {
  return (
    <>
      {image ? (
        fit === 'contain' ? (
          <>
            <Img
              src={image.url}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(48px) brightness(0.72)',
                transform: 'scale(1.12)',
              }}
            />
            {/* contained art lives in the upper band, clear of the text block */}
            <Img
              src={image.url}
              style={{
                position: 'absolute',
                top: '11%',
                width: '100%',
                height: '48%',
                objectFit: 'contain',
              }}
            />
          </>
        ) : (
          <Img
            src={image.url}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              ...(variant === 'cta'
                ? {filter: 'blur(26px) brightness(0.4)', transform: 'scale(1.1)'}
                : {}),
            }}
          />
        )
      ) : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.92) 100%)',
        }}
      />
    </>
  );
};
