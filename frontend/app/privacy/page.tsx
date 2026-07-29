import type { Metadata } from "next";

import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy. Tapa.",
  description:
    "How Tapa handles wallet addresses, usage events and settlement records.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="29 July 2026">
      <h2>What we collect</h2>
      <p>
        Tapa identifies you by the wallet address you connect. There is no
        username, password or email account. We do not ask for your name, and we
        have no way to link a wallet address to a real identity on our own.
      </p>
      <p>
        While a session is running we record the usage events the meter produces
        and the settlements they trigger: unit type, quantity, amount, currency,
        timestamp and transaction hash.
      </p>

      <h2>What is public</h2>
      <p>
        Settlements are real transactions on Celo. Once a payment settles, the
        payer address, recipient address, amount and timestamp are permanently
        public on the blockchain and are visible to anyone. Tapa cannot edit or
        remove that record, and neither can you.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell or share your data with advertisers.</li>
        <li>We do not run third-party advertising or tracking pixels.</li>
        <li>
          We never have custody of your private keys, and we never ask for a
          seed phrase.
        </li>
      </ul>

      <h2>Retention</h2>
      <p>
        Session records are kept so the settlement log stays accurate and so
        payments can be reconciled against the blockchain. On-chain records
        cannot be deleted by anyone, including us.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can go to the project repository at{" "}
        <a
          className="legal-inline"
          href="https://github.com/solutionkanu12/tapa"
          target="_blank"
          rel="noopener"
        >
          github.com/solutionkanu12/tapa
        </a>
        .
      </p>
    </LegalLayout>
  );
}
