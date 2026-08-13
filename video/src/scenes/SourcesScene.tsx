import React from 'react';
import {Img, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {HeadlineWithHighlights} from '../TextArticle';
import {SlideStage} from './SlideStage';

export interface SourceItem {
  name: string;
  date: string;
  favicon: string | null;
}

const SourceRow: React.FC<{source: SourceItem; index: number}> = ({source, index}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({
    frame: frame - (16 + index * 7),
    fps,
    config: {damping: 200},
  });
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontSize: 34,
        color: '#333',
        marginTop: 18,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 18}px)`,
      }}
    >
      {source.favicon ? (
        <Img
          src={source.favicon}
          style={{width: 40, height: 40, borderRadius: 8, display: 'block'}}
        />
      ) : (
        <div style={{width: 40, height: 40, borderRadius: 8, backgroundColor: '#eee'}} />
      )}
      <span style={{fontWeight: 600}}>{source.name}</span>
      <span style={{color: '#888'}}> · {source.date}</span>
    </div>
  );
};

export const SourcesScene: React.FC<{
  independentSources: number;
  sources: SourceItem[];
  durationInFrames: number;
}> = ({independentSources, sources}) => {
  const phrase = `${independentSources} veículos independentes`;
  return (
    <SlideStage direction="right">
      <div
        style={{
          backgroundColor: 'white',
          padding: '96px 110px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 28,
            color: '#555',
            textDecoration: 'underline',
            textUnderlineOffset: 6,
            marginBottom: 28,
          }}
        >
          A apuração
        </div>
        <HeadlineWithHighlights
          headline={`Confirmado por ${phrase}`}
          highlights={[phrase]}
          fontSize={62}
          highlightStartAt={14}
        />
        <div style={{marginTop: 26}}>
          {sources.slice(0, 6).map((source, i) => (
            <SourceRow key={`${source.name}-${i}`} source={source} index={i} />
          ))}
        </div>
      </div>
    </SlideStage>
  );
};
