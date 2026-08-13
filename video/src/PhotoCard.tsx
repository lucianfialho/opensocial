import React from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {PhotoCardBackground} from './PhotoCardBackground';

export const photoCardSchema = z.object({
  brand: z.string(),
  handle: z.string(),
  kicker: z.string(),
  headline: z.string(),
  image: z.object({url: z.string(), credit: z.string()}).nullable(),
  variant: z.enum(['title', 'body', 'cta']),
  fit: z.enum(['cover', 'contain']),
});

export type PhotoCardProps = z.infer<typeof photoCardSchema>;

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, sans-serif';

/** Editorial photo-first card: full-bleed image, dark gradient, caps headline. */
export const PhotoCard: React.FC<PhotoCardProps> = ({
  brand,
  handle,
  kicker,
  headline,
  image,
  variant,
  fit,
}) => {
  const headlineSize =
    variant === 'cta'
      ? 84
      : variant === 'title'
        ? headline.length > 90
          ? 52
          : 62
        : headline.length > 220
          ? 34
          : headline.length > 120
            ? 40
            : 46;
  return (
    <AbsoluteFill style={{backgroundColor: '#101013', fontFamily: SANS}}>
      <PhotoCardBackground image={image} fit={fit} variant={variant} />
      <AbsoluteFill style={{justifyContent: 'space-between', padding: 56}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div style={{color: 'white', fontSize: 40, fontWeight: 800, letterSpacing: -0.5}}>
            {brand}
          </div>
          {variant === 'title' ? (
            <div
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontSize: 24,
                fontWeight: 600,
                backgroundColor: 'rgba(0,0,0,0.45)',
                padding: '10px 20px',
                borderRadius: 999,
              }}
            >
              {handle}
            </div>
          ) : null}
        </div>
        <div
          style={
            variant === 'cta'
              ? {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  justifyContent: 'center',
                  textAlign: 'center',
                }
              : undefined
          }
        >
          <div
            style={{
              color: 'white',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: 'uppercase',
              marginBottom: variant === 'cta' ? 0 : 20,
              marginTop: variant === 'cta' ? 26 : 0,
              textShadow: '0 1px 12px rgba(0,0,0,0.6)',
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              color: 'white',
              fontWeight: 800,
              fontSize: headlineSize,
              lineHeight: 1.18,
              textTransform: 'uppercase',
              textShadow: '0 2px 18px rgba(0,0,0,0.65)',
            }}
          >
            {headline}
          </div>
          {variant === 'cta' ? (
            <div
              style={{
                alignSelf: 'center',
                backgroundColor: 'white',
                color: '#101013',
                fontSize: 26,
                fontWeight: 800,
                padding: '16px 34px',
                borderRadius: 999,
                marginBottom: 38,
              }}
            >
              Siga para mais notícias
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
      {image && variant !== 'cta' ? (
        <div
          style={{
            position: 'absolute',
            right: 16,
            top: '46%',
            transform: 'rotate(90deg)',
            transformOrigin: 'right center',
            color: 'rgba(255,255,255,0.66)',
            fontSize: 16,
          }}
        >
          {image.credit}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
