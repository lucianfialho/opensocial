import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Series, staticFile} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {CaptionOverlay} from './CaptionOverlay';
import {Watermark} from './Watermark';
import {narrationSchema, sceneDurations} from './narration';
import {SplitImage, SplitClosing} from './SplitScenes';

const imageSchema = z.object({url: z.string(), credit: z.string()});

export const newsSplitSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  highlights: z.array(z.string()),
  dateline: z.string(),
  independentSources: z.number(),
  image: imageSchema.nullable(),
  claims: z.array(
    z.object({label: z.string(), texto: z.string(), image: imageSchema.nullable()}),
  ),
  sources: z.array(
    z.object({name: z.string(), date: z.string(), favicon: z.string().nullable()}),
  ),
  brand: z.string(),
  tagline: z.string(),
  personaSrc: z.string(),
  narration: narrationSchema,
});

export type NewsSplitProps = z.infer<typeof newsSplitSchema>;

const MAX_CLAIMS = 3;

export const calculateNewsSplitMetadata: CalculateMetadataFunction<NewsSplitProps> = ({
  props,
}) => {
  const d = sceneDurations(Math.min(props.claims.length, MAX_CLAIMS), props.narration);
  return {
    durationInFrames: d.hook + d.claims.reduce((a, b) => a + b, 0) + d.sources + d.closing,
  };
};

/**
 * Split-screen reel: scene slider on the top half (cut to the narration,
 * like NewsReel), the o agêntico reporter lip-syncing below.
 */
export const NewsSplit: React.FC<NewsSplitProps> = (props) => {
  const {image, claims, brand, tagline, personaSrc, narration} = props;
  const shownClaims = claims.slice(0, MAX_CLAIMS);
  const durations = sceneDurations(shownClaims.length, narration);
  const fallback = image ?? shownClaims.find((c) => c.image)?.image ?? null;
  return (
    <AbsoluteFill style={{backgroundColor: 'white'}}>
      <div style={{position: 'absolute', top: 0, width: '100%', height: '50%', overflow: 'hidden'}}>
        <Series>
          <Series.Sequence durationInFrames={durations.hook}>
            {fallback ? (
              <SplitImage image={fallback} zoom="in" />
            ) : (
              <SplitClosing brand={brand} tagline={tagline} />
            )}
          </Series.Sequence>
          {shownClaims.map((claim, i) => {
            const sceneImage = claim.image ?? fallback;
            return (
              <Series.Sequence key={i} durationInFrames={durations.claims[i]}>
                {sceneImage ? (
                  <SplitImage image={sceneImage} zoom={i % 2 === 0 ? 'out' : 'in'} />
                ) : (
                  <SplitClosing brand={brand} tagline={tagline} />
                )}
              </Series.Sequence>
            );
          })}
          <Series.Sequence durationInFrames={durations.sources + durations.closing}>
            <SplitClosing brand={brand} tagline={tagline} />
          </Series.Sequence>
        </Series>
      </div>
      <OffthreadVideo
        src={staticFile(personaSrc)}
        muted
        style={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
          height: '50%',
          objectFit: 'cover',
        }}
      />
      {/* handle sits on the seam between the slider and the reporter */}
      <Watermark handle="@oagentico" whiteFromFrame={Number.MAX_SAFE_INTEGER} handleTop={932} />
      {narration ? (
        <>
          <Audio src={staticFile(narration.clip.src)} />
          {/* caption rides the seam between the card and the studio, clear of her face */}
          <CaptionOverlay
            clip={narration.clip}
            whiteFromFrame={Number.MAX_SAFE_INTEGER}
            bottom={790}
            chip
          />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
