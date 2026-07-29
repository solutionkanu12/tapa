import Link from "next/link";

import { BrandMark } from "./BrandMark";
import { SiteFooter } from "./SiteFooter";

type LegalLayoutProps = {
  title: string;
  updated: string;
  children: React.ReactNode;
};

/**
 * Shell for the static legal pages. Deliberately does not reuse the landing
 * page's nav island, whose links are in-page anchors that would not resolve
 * from a subpage.
 */
export function LegalLayout({ title, updated, children }: LegalLayoutProps) {
  return (
    <>
      <header className="legal-head">
        <Link href="/" className="brand">
          <BrandMark />
          tapa
        </Link>
        <Link href="/" className="legal-back">
          ← Back to home
        </Link>
      </header>

      <main className="legal">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {updated}</p>
        <div className="legal-note">
          This is placeholder copy for the hackathon build. It is not legal
          advice and has not been reviewed by a lawyer. It will be replaced
          before Tapa handles anyone&apos;s funds other than the team&apos;s
          own.
        </div>
        {children}
      </main>

      <SiteFooter />
    </>
  );
}
