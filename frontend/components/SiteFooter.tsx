import { BrandMark } from "./BrandMark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="foot-inner">
        <div className="foot-brand">
          <BrandMark tile="#F3F0FA" drop="#12112A" size={20} />
          tapa
        </div>
        <div className="foot-mid">
          <a href="#">Terms of use</a>
          <a href="#">Privacy policy</a>
        </div>
        <div className="foot-social">
          <a
            href="https://github.com/solutionkanu12/tapa"
            target="_blank"
            rel="noopener"
            aria-label="GitHub"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="#F3F0FA"
                d="M12 0C5.37 0 0 5.5 0 12.26c0 5.42 3.44 10.02 8.2 11.64.6.12.82-.27.82-.6v-2.1c-3.34.75-4.04-1.65-4.04-1.65-.55-1.44-1.34-1.82-1.34-1.82-1.1-.77.08-.76.08-.76 1.2.09 1.84 1.26 1.84 1.26 1.08 1.9 2.83 1.35 3.52 1.03.1-.8.42-1.35.77-1.66-2.67-.31-5.47-1.37-5.47-6.1 0-1.35.46-2.45 1.24-3.32-.13-.31-.54-1.57.12-3.27 0 0 1-.33 3.3 1.27a11.2 11.2 0 0 1 6 0c2.28-1.6 3.3-1.27 3.3-1.27.66 1.7.25 2.96.12 3.27.77.87 1.24 1.97 1.24 3.32 0 4.74-2.8 5.78-5.48 6.08.43.38.81 1.14.81 2.3v3.42c0 .33.22.72.83.6C20.57 22.27 24 17.68 24 12.26 24 5.5 18.63 0 12 0Z"
              />
            </svg>
          </a>
          <a
            href="https://x.com/solutionkanu"
            target="_blank"
            rel="noopener"
            aria-label="X"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="#F3F0FA"
                d="M18.24 2H21.5l-7.34 8.39L22.8 22h-6.77l-5.3-6.94L4.6 22H1.33l7.85-8.97L1 2h6.94l4.8 6.35L18.24 2Zm-1.19 18h1.87L7.03 3.9H5.02L17.05 20Z"
              />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
