import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, staticFile} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {CaptionOverlay} from './CaptionOverlay';
import {HeadlineWithHighlights} from './TextArticle';
import {ImageWithCredit} from './ImageWithCredit';
import {Watermark} from './Watermark';
import {audioClipSchema} from './narration';

export const newsSplitSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  highlights: z.array(z.string()),
  dateline: z.string(),
  independentSources: z.number(),
  image: z.object({url: z.string(), credit: z.string()}).nullable(),
  personaSrc: z.string(),
  clip: audioClipSchema,
});

export type NewsSplitProps = z.infer<typeof newsSplitSchema>;

export const calculateNewsSplitMetadata: CalculateMetadataFunction<NewsSplitProps> = ({
  props,
}) => ({durationInFrames: props.clip.durationInFrames + 12});

/**
 * Split-screen reel: editorial card on the top half, the o agêntico
 * reporter lip-syncing the full narration on the bottom half.
 */
export const NewsSplit: React.FC<NewsSplitProps> = (props) => {
  const {kicker, headline, highlights, dateline, independentSources} = props;
  const {image, personaSrc, clip} = props;
  return (
    <AbsoluteFill style={{backgroundColor: 'white'}}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          width: '100%',
          height: '50%',
          overflow: 'hidden',
          padding: '330px 90px 30px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {image ? <ImageWithCredit image={image} height={280} /> : null}
        <div
          style={{
            fontSize: 26,
            color: '#555',
            textDecoration: 'underline',
            textUnderlineOffset: 6,
            marginBottom: 20,
          }}
        >
          {kicker}
        </div>
        <HeadlineWithHighlights headline={headline} highlights={highlights} fontSize={48} />
        <div style={{fontSize: 25, color: '#333', marginTop: 22}}>
          {`Apuração: ${independentSources} veículos independentes · ${dateline}`}
        </div>
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
      <Watermark handle="@oagentico" whiteFromFrame={Number.MAX_SAFE_INTEGER} />
      <Audio src={staticFile(clip.src)} />
      {/* caption rides the seam between the card and the studio, clear of her face */}
      <CaptionOverlay clip={clip} whiteFromFrame={Number.MAX_SAFE_INTEGER} bottom={790} />
    </AbsoluteFill>
  );
};
