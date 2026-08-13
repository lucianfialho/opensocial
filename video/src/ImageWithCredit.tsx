import React from 'react';
import {Img} from 'remotion';

export interface CreditedImage {
  url: string;
  credit: string;
}

/** Remote image with the source credit always visible (bottom-right). */
export const ImageWithCredit: React.FC<{
  image: CreditedImage;
  height: number;
}> = ({image, height}) => {
  return (
    <div style={{position: 'relative', marginBottom: 36}}>
      <Img
        src={image.url}
        style={{
          width: '100%',
          height,
          objectFit: 'cover',
          borderRadius: 14,
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          fontSize: 17,
          color: '#333',
          backgroundColor: 'rgba(255,255,255,0.88)',
          padding: '4px 10px',
          borderRadius: 6,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {image.credit}
      </div>
    </div>
  );
};
