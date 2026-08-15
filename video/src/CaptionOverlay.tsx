import {loadFont} from '@remotion/fonts';
import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {z} from 'zod';
import type {audioClipSchema} from './narration';
import {useCaptionBottom} from './safeArea';

const fontFamily = 'Parkinsans';
loadFont({family: fontFamily, url: staticFile('fonts/Parkinsans-ExtraBold.ttf'), weight: '800'});

type Clip = z.infer<typeof audioClipSchema> | null | undefined;

/**
 * One-word-at-a-time karaoke caption pinned to the top of the frame,
 * driven by the narration clip's word timings.
 */
export const CaptionOverlay: React.FC<{
  clip: Clip;
  /** From this frame on the text renders white (dark closing background). */
  whiteFromFrame?: number;
  /** Override the distance from the bottom edge (px at 1920 height). */
  bottom?: number;
}> = ({clip, whiteFromFrame, bottom}) => {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();
  const defaultBottom = useCaptionBottom();
  const captionBottom = bottom !== undefined ? bottom * (height / 1920) : defaultBottom;
  const words = clip?.words;
  if (!words || words.length === 0) return null;

  const t = frame / fps;
  // keep each word visible until the next one starts (no flicker on gaps)
  let word = null;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    if (t >= words[i].start && (next ? t < next.start : t <= words[i].end + 0.4)) {
      word = words[i];
      break;
    }
  }
  if (!word) return null;

  // long words shrink so they never clip at the edges
  const fontSize = word.text.length <= 10 ? 84 : word.text.length <= 14 ? 64 : 50;

  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          bottom: captionBottom,
          color:
            whiteFromFrame !== undefined && frame >= whiteFromFrame
              ? 'white'
              : '#101013',
          fontFamily,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.1,
          maxWidth: '92%',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {word.text}
      </div>
    </AbsoluteFill>
  );
};
