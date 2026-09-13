import React from 'react';
import {AbsoluteFill, Audio, Series, staticFile} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {CaptionOverlay} from './CaptionOverlay';
import {TextArticle} from './TextArticle';
import {narrationSchema, sceneDurations} from './narration';
import {Watermark} from './Watermark';
import {ClaimScene} from './scenes/ClaimScene';
import {SourcesScene} from './scenes/SourcesScene';
import {ClosingScene} from './scenes/ClosingScene';

const imageSchema = z.object({url: z.string(), credit: z.string()});

export const newsReelSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  highlights: z.array(z.string()),
  dateline: z.string(),
  independentSources: z.number(),
  image: imageSchema.nullable(),
  claims: z.array(
    z.object({
      label: z.string(),
      texto: z.string(),
      gloss: z.string(),
      highlights: z.array(z.string()),
      image: imageSchema.nullable(),
    }),
  ),
  sources: z.array(
    z.object({name: z.string(), date: z.string(), favicon: z.string().nullable()}),
  ),
  brand: z.string(),
  handle: z.string().default('@oagentico'),
  tagline: z.string(),
  narration: narrationSchema,
});

export type NewsReelProps = z.infer<typeof newsReelSchema>;

const MAX_CLAIMS = 3;

const total = (props: NewsReelProps) => {
  const d = sceneDurations(Math.min(props.claims.length, MAX_CLAIMS), props.narration);
  return d.hook + d.claims.reduce((a, b) => a + b, 0) + d.sources + d.closing;
};

export const calculateNewsReelMetadata: CalculateMetadataFunction<NewsReelProps> = ({
  props,
}) => ({durationInFrames: total(props)});

export const NewsReel: React.FC<NewsReelProps> = (props) => {
  const {kicker, headline, highlights, dateline, independentSources, image} = props;
  const {claims, sources, brand, tagline, narration, handle} = props;
  const shownClaims = claims.slice(0, MAX_CLAIMS);
  const durations = sceneDurations(shownClaims.length, narration);
  const closingStart =
    durations.hook + durations.claims.reduce((a, b) => a + b, 0) + durations.sources;
  return (
    <AbsoluteFill>
      <Series>
        <Series.Sequence durationInFrames={durations.hook}>
          <TextArticle
            kicker={kicker}
            headline={headline}
            highlights={highlights}
            byline={`Apuração: ${independentSources} veículos independentes`}
            dateline={dateline}
            sweepDurationInFrames={durations.hook}
            image={image}
          />
        </Series.Sequence>
        {shownClaims.map((claim, i) => (
          <Series.Sequence key={i} durationInFrames={durations.claims[i]}>
            <ClaimScene
              label={claim.label}
              texto={claim.texto}
              gloss={claim.gloss}
              highlights={claim.highlights}
              image={claim.image}
              durationInFrames={durations.claims[i]}
              direction={i % 2 === 0 ? 'right' : 'left'}
            />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={durations.sources}>
          <SourcesScene
            independentSources={independentSources}
            sources={sources}
            durationInFrames={durations.sources}
          />
        </Series.Sequence>
        <Series.Sequence durationInFrames={durations.closing}>
          <ClosingScene brand={brand} tagline={tagline} image={image} durationInFrames={durations.closing} />
        </Series.Sequence>
      </Series>
      <Watermark handle={handle} whiteFromFrame={closingStart} />
      {/* continuous voice + global word-by-word caption on top of every scene */}
      {narration ? (
        <>
          <Audio src={staticFile(narration.clip.src)} />
          <CaptionOverlay clip={narration.clip} whiteFromFrame={closingStart} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
