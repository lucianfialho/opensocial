import {loadFont} from '@remotion/fonts';
import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';

loadFont({family: 'Gofar Serif', url: staticFile('fonts/GofarSerif.otf')});
loadFont({family: 'Inter', url: staticFile('fonts/Inter-wght-400.ttf'), weight: '400'});
loadFont({family: 'Inter', url: staticFile('fonts/Inter-wght-800.ttf'), weight: '800'});

export const tweetClipSchema = z.object({
  headline: z.string(),
  credit: z.string(), // "via @fonte"
  videoSrc: z.string(), // staticFile-relative
  videoDurationInFrames: z.number(),
  videoAspect: z.number(), // width / height
});

export type TweetClipProps = z.infer<typeof tweetClipSchema>;

export const calculateTweetClipMetadata: CalculateMetadataFunction<TweetClipProps> = ({
  props,
}) => ({durationInFrames: props.videoDurationInFrames});

/**
 * Trending-clip reel: a tweet-style card — brand header, bold headline,
 * the source video playing inside with its own audio, source credit.
 */
export const TweetClip: React.FC<TweetClipProps> = (props) => {
  const {headline, credit, videoSrc, videoAspect} = props;
  const cardW = 980;
  const videoH = Math.min(1150, Math.round(cardW / videoAspect));
  const headlineSize = headline.length > 120 ? 40 : headline.length > 70 ? 48 : 56;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#131311',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          width: cardW,
          backgroundColor: '#1c1b18',
          border: '1px solid #33312a',
          borderRadius: 28,
          padding: '36px 40px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: 26,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              backgroundColor: 'white',
              color: '#101013',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"Gofar Serif", Georgia, serif',
              fontSize: 52,
              paddingBottom: 8,
            }}
          >
            o
          </div>
          <div>
            <div style={{color: 'white', fontWeight: 800, fontSize: 30}}>o agêntico</div>
            <div style={{color: '#a39e91', fontSize: 24}}>@oagentico</div>
          </div>
        </div>
        <div
          style={{
            color: 'white',
            fontWeight: 800,
            fontSize: headlineSize,
            lineHeight: 1.18,
            letterSpacing: -0.5,
          }}
        >
          {headline}
        </div>
        <div style={{borderRadius: 20, overflow: 'hidden', backgroundColor: 'black'}}>
          <OffthreadVideo
            src={staticFile(videoSrc)}
            style={{width: '100%', height: videoH, objectFit: 'cover', display: 'block'}}
          />
        </div>
        <div style={{color: '#a39e91', fontSize: 23}}>{credit}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 120,
          width: '100%',
          textAlign: 'center',
          fontFamily: '"Gofar Serif", Georgia, serif',
          fontSize: 40,
          color: 'rgba(255,255,255,0.85)',
        }}
      >
        oagentico
      </div>
    </AbsoluteFill>
  );
};
