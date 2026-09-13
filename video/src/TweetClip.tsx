import {loadFont} from '@remotion/fonts';
import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';

loadFont({family: 'Gofar Serif', url: staticFile('fonts/GofarSerif.otf')});
loadFont({family: 'Inter', url: staticFile('fonts/Inter-wght-800.ttf'), weight: '800'});

export const tweetClipSchema = z.object({
  brand: z.string().default('oagêntico'),
  headline: z.string(),
  credit: z.string(),
  videoSrc: z.string(),
  videoDurationInFrames: z.number(),
  videoAspect: z.number(),
  position: z.enum(['top', 'bottom']).default('bottom'),
});

export type TweetClipProps = z.infer<typeof tweetClipSchema>;

export const calculateTweetClipMetadata: CalculateMetadataFunction<TweetClipProps> = ({
  props,
}) => ({durationInFrames: props.videoDurationInFrames});

/**
 * Trending-clip reel, "the news" style: fullscreen video, small wordmark
 * up top, headline in per-line black boxes with a yellow bar at the left.
 */
export const TweetClip: React.FC<TweetClipProps> = (props) => {
  const {headline, credit, videoSrc, position} = props;
  const headlineSize = headline.length > 110 ? 44 : headline.length > 70 ? 50 : 56;
  return (
    <AbsoluteFill style={{backgroundColor: 'black', fontFamily: 'Inter, sans-serif'}}>
      <OffthreadVideo
        src={staticFile(videoSrc)}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
      {/* soft vignette only where the wordmark sits */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 240,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 96,
          width: '100%',
          textAlign: 'center',
          fontFamily: '"Gofar Serif", Georgia, serif',
          fontSize: 54,
          color: 'white',
          textShadow: '0 2px 12px rgba(0,0,0,0.45)',
        }}
      >
        {props.brand}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 100,
          ...(position === 'top' ? {top: 220} : {bottom: 230}),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 18,
        }}
      >
        <div style={{display: 'flex'}}>
          <div style={{width: 14, backgroundColor: '#ffe234', flexShrink: 0}} />
          <div
            style={{
              color: 'white',
              fontWeight: 800,
              fontSize: headlineSize,
              lineHeight: 1.42,
              letterSpacing: -0.5,
            }}
          >
            <span
              style={{
                backgroundColor: 'rgba(12,12,10,0.94)',
                padding: '6px 18px',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }}
            >
              {headline}
            </span>
          </div>
        </div>
        {credit ? (
          <div
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 22,
              letterSpacing: 2,
              textTransform: 'uppercase',
              textShadow: '0 1px 8px rgba(0,0,0,0.7)',
              marginLeft: 14,
            }}
          >
            {credit}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
