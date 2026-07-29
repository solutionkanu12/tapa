import { Fragment } from "react";

const WORDS = ["SOLAR", "WATER", "DATA", "POWER"];

export function Marquee() {
  // The track is rendered twice because the scroll keyframe translates by -50%
  // and needs the duplicate copy to make the loop seamless.
  const sequence = [...WORDS, ...WORDS];

  return (
    <div className="marquee-band">
      <div className="marquee-track" aria-hidden="true">
        {sequence.map((word, index) => (
          <Fragment key={`${word}-${index}`}>
            <span>{word}</span>
            <span className="pop">/</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
