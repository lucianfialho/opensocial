import {useVideoConfig} from 'remotion';

/**
 * Instagram Reels safe zones (1080x1920): UI overlays the top 220px and the
 * bottom 490px. All content and captions must live inside the remaining band.
 */
export const REEL_SAFE_ZONE = {top: 220, bottom: 490};

const isReelShaped = (width: number, height: number) => height / width >= 1.7;

/** Vertical padding that keeps centered content inside the safe band. */
export const useSafeAreaPadding = () => {
  const {width, height} = useVideoConfig();
  if (!isReelShaped(width, height)) return {paddingTop: 0, paddingBottom: 0};
  const scale = height / 1920;
  return {
    paddingTop: REEL_SAFE_ZONE.top * scale,
    paddingBottom: REEL_SAFE_ZONE.bottom * scale,
  };
};

/** Caption offset: just above the Instagram UI area (or 7% on other formats). */
export const useCaptionBottom = () => {
  const {width, height} = useVideoConfig();
  if (!isReelShaped(width, height)) return '7%';
  return (REEL_SAFE_ZONE.bottom + 28) * (height / 1920);
};
