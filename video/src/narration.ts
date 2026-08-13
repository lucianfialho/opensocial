import {z} from 'zod';

export const wordTimingSchema = z.object({
  text: z.string(),
  start: z.number(), // seconds within the clip
  end: z.number(),
});

export const audioClipSchema = z.object({
  src: z.string(), // staticFile-relative, e.g. audio/news-1800-hook.mp3
  durationInFrames: z.number(),
  words: z.array(wordTimingSchema).nullable(),
});

/**
 * One continuous narration track for the whole reel; scene cuts (in frames)
 * are derived from the sentence timestamps inside it, so the voice never
 * stops between scenes.
 */
export const narrationSchema = z
  .object({
    clip: audioClipSchema,
    cuts: z.object({
      hook: z.number(),
      claims: z.array(z.number()),
      sources: z.number(),
      closing: z.number(),
    }),
  })
  .nullable();

export type Narration = z.infer<typeof narrationSchema>;

export const BASE_DURATIONS = {hook: 150, claim: 135, sources: 120, closing: 90};

export const sceneDurations = (claimCount: number, narration: Narration | undefined) => {
  if (!narration) {
    return {
      hook: BASE_DURATIONS.hook,
      claims: Array.from({length: claimCount}, () => BASE_DURATIONS.claim),
      sources: BASE_DURATIONS.sources,
      closing: BASE_DURATIONS.closing,
    };
  }
  const {cuts} = narration;
  return {
    hook: cuts.hook,
    claims: Array.from({length: claimCount}, (_, i) => cuts.claims[i] ?? BASE_DURATIONS.claim),
    sources: cuts.sources,
    closing: cuts.closing,
  };
};

export const totalDuration = (claimCount: number, narration: Narration | undefined) => {
  const d = sceneDurations(claimCount, narration);
  return d.hook + d.claims.reduce((a, b) => a + b, 0) + d.sources + d.closing;
};
