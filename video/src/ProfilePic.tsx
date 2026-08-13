import {loadFont} from '@remotion/fonts';
import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import {z} from 'zod';

loadFont({family: 'Gofar Serif', url: staticFile('fonts/GofarSerif.otf')});

export const profilePicSchema = z.object({
  letter: z.string(),
  background: z.string(),
  color: z.string(),
});

export type ProfilePicProps = z.infer<typeof profilePicSchema>;

/** Square avatar: a single Gofar Serif letter, centered. */
export const ProfilePic: React.FC<ProfilePicProps> = ({letter, background, color}) => {
  const isLowercase = letter === letter.toLowerCase();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: background,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontFamily: '"Gofar Serif", Georgia, serif',
          fontSize: isLowercase ? 880 : 760,
          lineHeight: 1,
          color,
          // optical centering: the em box reserves ascender space, so
          // x-height glyphs sit low; caps need less correction
          transform: isLowercase ? 'translateY(-14%)' : 'translateY(-4%)',
        }}
      >
        {letter}
      </div>
    </AbsoluteFill>
  );
};
