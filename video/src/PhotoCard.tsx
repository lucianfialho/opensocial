import React from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {PhotoCardBackground} from './PhotoCardBackground';
import {AccentText, Masthead, Pager, SANS} from './PhotoCardText';
import {CreamCard, EssayCard, CtaCard} from './PhotoCardVariants';

export const photoCardSchema = z.object({
  brand: z.string(),
  handle: z.string(),
  kicker: z.string(),
  headline: z.string(),
  subtitle: z.string().optional(),
  intro: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  closer: z.string().optional(),
  numeral: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  page: z.string().optional(),
  image: z.object({url: z.string(), credit: z.string()}).nullable(),
  variant: z.enum(['title', 'body', 'essay', 'cta']),
  fit: z.enum(['cover', 'contain']),
});

export type PhotoCardProps = z.infer<typeof photoCardSchema>;

const Credit: React.FC<{credit: string}> = ({credit}) => (
  <div style={{position: 'absolute', top: 20, left: 22, color: 'rgba(255,255,255,0.62)', fontSize: 17, fontFamily: SANS}}>
    {`* ${credit.replace(/^Foto: /, '')}`}
  </div>
);

/** Magazine-style carousel card. Cover: full-bleed photo, masthead, accent
 *  headline + serif subtitle. Body w/ photo: same dark language. Essay and
 *  cream: text-first middles. CTA: brand card. */
export const PhotoCard: React.FC<PhotoCardProps> = (props) => {
  const {brand, kicker, headline, subtitle, intro, paragraphs, closer, numeral} = props;
  const {highlights, page, image, variant, fit} = props;

  if (variant === 'cta') return <CtaCard kicker={kicker} headline={headline} />;
  if (variant === 'essay') {
    return (
      <EssayCard
        brand={brand}
        kicker={kicker}
        headline={headline}
        paragraphs={paragraphs}
        closer={closer}
        numeral={numeral}
        highlights={highlights}
        page={page}
      />
    );
  }
  if (variant === 'body' && !image) {
    return (
      <CreamCard
        brand={brand}
        kicker={kicker}
        headline={headline}
        intro={intro}
        highlights={highlights}
        page={page}
      />
    );
  }

  const isCover = variant === 'title';
  return (
    <AbsoluteFill style={{backgroundColor: '#101013', fontFamily: SANS}}>
      <PhotoCardBackground image={image} fit={fit} variant={variant} />
      <Masthead brand={brand} mode="dark" />
      {image ? <Credit credit={image.credit} /> : null}
      <AbsoluteFill style={{justifyContent: 'flex-end', padding: '56px 60px 70px'}}>
        {!isCover ? (
          <div
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: 23,
              fontWeight: 700,
              letterSpacing: 5,
              textTransform: 'uppercase',
              marginBottom: 18,
              textShadow: '0 1px 10px rgba(0,0,0,0.6)',
            }}
          >
            {kicker}
          </div>
        ) : null}
        <AccentText
          text={headline}
          highlights={highlights ?? []}
          fontSize={isCover ? (headline.length > 90 ? 58 : 72) : headline.length > 160 ? 42 : 50}
          mode="dark"
        />
        {subtitle ? (
          <div
            style={{
              color: 'rgba(255,255,255,0.88)',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 30,
              lineHeight: 1.4,
              marginTop: 22,
              textShadow: '0 1px 10px rgba(0,0,0,0.6)',
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </AbsoluteFill>
      <Pager page={page} mode="dark" />
    </AbsoluteFill>
  );
};
