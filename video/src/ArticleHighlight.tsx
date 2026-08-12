import React from 'react';
import {Img, staticFile} from 'remotion';
import {ArticleMotion, useHighlightProgress} from './ArticleMotion';
import highlights from './highlights.json';
import {RoughHighlight} from './RoughHighlight';

const ImageHighlight: React.FC<{
  box: (typeof highlights.phrases)[number];
  index: number;
}> = ({box, index}) => {
  const progress = useHighlightProgress(index);
  return <RoughHighlight box={box} progress={progress} seed={42 + index} />;
};

export const ArticleHighlight: React.FC = () => {
  return (
    <ArticleMotion>
      <div style={{position: 'relative'}}>
        <Img src={staticFile('article.png')} style={{width: '100%', display: 'block'}} />
        {/* multiply blend keeps the dark text visible on top of the yellow
            stroke — the marker reads as being behind the text */}
        <svg
          viewBox={`0 0 ${highlights.image.width} ${highlights.image.height}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            mixBlendMode: 'multiply',
          }}
        >
          {highlights.phrases.map((phrase, i) => (
            <ImageHighlight key={phrase.text} box={phrase} index={i} />
          ))}
        </svg>
      </div>
    </ArticleMotion>
  );
};
