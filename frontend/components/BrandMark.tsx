type BrandMarkProps = {
  /** Fill for the rounded tile. Inverts to paper on dark backgrounds. */
  tile?: string;
  /** Fill for the inner drop. */
  drop?: string;
  size?: number;
};

export function BrandMark({
  tile = "#12112A",
  drop = "#D6FF4F",
  size,
}: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(-8 24 24)">
        <rect x="6" y="6" width="36" height="36" rx="12" fill={tile} />
        <circle cx="24" cy="20" r="9" fill={drop} />
      </g>
      <circle cx="35" cy="36" r="5.5" fill="#FF5D5D" />
    </svg>
  );
}

/** The little metering character shown in the dial footer. */
export function TapoMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="13" r="8" fill="#D6FF4F" />
      <circle cx="9" cy="12" r="1" fill="#12112A" />
      <circle cx="15" cy="12" r="1" fill="#12112A" />
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="6"
        stroke="#D6FF4F"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
