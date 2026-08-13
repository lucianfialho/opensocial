import React from 'react';
import {Series} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {TextArticle} from './TextArticle';
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
  tagline: z.string(),
});

export type NewsReelProps = z.infer<typeof newsReelSchema>;

const HOOK = 150;
const CLAIM = 135;
const SOURCES = 120;
const CLOSING = 90;
const MAX_CLAIMS = 3;

export const calculateNewsReelMetadata: CalculateMetadataFunction<NewsReelProps> = ({
  props,
}) => ({
  durationInFrames:
    HOOK + Math.min(props.claims.length, MAX_CLAIMS) * CLAIM + SOURCES + CLOSING,
});

export const NewsReel: React.FC<NewsReelProps> = ({
  kicker,
  headline,
  highlights,
  dateline,
  independentSources,
  image,
  claims,
  sources,
  brand,
  tagline,
}) => {
  const shownClaims = claims.slice(0, MAX_CLAIMS);
  return (
    <Series>
      <Series.Sequence durationInFrames={HOOK}>
        <TextArticle
          kicker={kicker}
          headline={headline}
          highlights={highlights}
          byline={`Apuração: ${independentSources} veículos independentes`}
          dateline={dateline}
          sweepDurationInFrames={HOOK}
          image={image}
        />
      </Series.Sequence>
      {shownClaims.map((claim, i) => (
        <Series.Sequence key={i} durationInFrames={CLAIM}>
          <ClaimScene
            label={claim.label}
            texto={claim.texto}
            gloss={claim.gloss}
            highlights={claim.highlights}
            image={claim.image}
            durationInFrames={CLAIM}
            direction={i % 2 === 0 ? 'right' : 'left'}
          />
        </Series.Sequence>
      ))}
      <Series.Sequence durationInFrames={SOURCES}>
        <SourcesScene
          independentSources={independentSources}
          sources={sources}
          durationInFrames={SOURCES}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={CLOSING}>
        <ClosingScene brand={brand} tagline={tagline} image={image} durationInFrames={CLOSING} />
      </Series.Sequence>
    </Series>
  );
};
