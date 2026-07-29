import type { Metadata } from "next";

import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service. Tapa.",
  description:
    "The terms covering use of Tapa, a demonstration agent that settles real payments on Celo.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="29 July 2026">
      <h2>What Tapa is</h2>
      <p>
        Tapa is a demonstration project. It meters usage and settles a payment
        for each unit as it is consumed, through the x402 facilitator on Celo.
        It is not a licensed utility, a payment institution or a financial
        service provider.
      </p>

      <h2>Real money</h2>
      <p>
        Settlements are genuine on-chain transfers of real stablecoins on Celo
        mainnet, not simulations. Every settlement is final and irreversible.
        There is no chargeback, refund or dispute mechanism. Do not connect a
        wallet holding funds you are not prepared to spend.
      </p>

      <h2>Spending limits</h2>
      <p>
        Each session has a spending limit you set before metering begins. Tapa
        stops settling once continuing would exceed that limit. The limit is a
        control on this software only. It does not restrict anything else your
        wallet can do.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You control your wallet and your private keys. We never hold them.</li>
        <li>You are responsible for what you authorise a connected wallet to do.</li>
        <li>
          You are responsible for any tax or reporting obligations arising from
          your transactions.
        </li>
      </ul>

      <h2>No warranty</h2>
      <p>
        Tapa is provided as is, without warranty of any kind. The usage feed in
        this build is simulated, and the software may contain defects, settle
        incorrectly, or become unavailable without notice. To the extent
        permitted by law, the project and its contributors are not liable for
        any loss arising from its use.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change as the project develops. The current version is
        always the one published at this address.
      </p>
    </LegalLayout>
  );
}
