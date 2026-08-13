import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {DESIGN_WIDTH} from '../ArticleMotion';

/**
 * Lighter stage for the scenes after the hook: no blur, no 3D — the card
 * slides in with a spring and keeps a tiny scale creep so it never sits
 * fully still.
 */
export const SlideStage: React.FC<{
  children: React.ReactNode;
  direction?: 'up' | 'right' | 'left';
}> = ({children, direction = 'up'}) => {
  const frame = useCurrentFrame();
  const {fps, width: compositionWidth, durationInFrames} = useVideoConfig();

  const fit = Math.min(compositionWidth * 0.9, DESIGN_WIDTH) / DESIGN_WIDTH;
  const enter = spring({frame, fps, config: {damping: 200}, durationInFrames: 22});
  const creep = interpolate(frame, [0, durationInFrames], [1, 1.03]);

  const offset = (1 - enter) * 90;
  const translate =
    direction === 'up'
      ? `translateY(${offset}px)`
      : direction === 'right'
        ? `translateX(${-offset}px)`
        : `translateX(${offset}px)`;

  return (
    <AbsoluteFill style={{backgroundColor: 'white'}}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            width: DESIGN_WIDTH,
            flexShrink: 0,
            opacity: enter,
            transform: `scale(${fit * creep}) ${translate}`,
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
