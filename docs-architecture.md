# Tapa, System Architecture

Companion document to `tapa-prd.md`. This defines how the system is actually built, not just what it does.

---

## 1. Architecture Overview

```
┌─────────────────┐        ┌──────────────────────┐        ┌─────────────────────┐
│   Frontend       │        │   Agent Service       │        │   Celo Network        │
│   Next.js app    │◄──────►│   Node, TypeScript    │◄──────►│   x402 facilitator     │
│   Wallet connect │  REST  │   Pricing + settlement│  x402  │   Wallets, RPC         │
│   Live dashboard │        │   Usage feed sim      │        │   Block explorer       │
└─────────────────┘        └──────────────────────┘        └─────────────────────┘
        │                              │
        │                              ▼
        │                    ┌──────────────────┐
        └───────────────────►│   Postgres        │
                              │   Supabase        │
                              └──────────────────┘
```

The frontend never talks to Celo or x402 directly for settlement, all pricing and settlement logic lives in the agent service. The frontend only reads state back through the internal API and handles wallet connect for identity and balance display.

## 2. Frontend

**Stack:** Next.js, React, TypeScript, Tailwind, matching the toolchain already used across other projects.

**Structure**
- `/` landing page, static, matches the existing prototype
- `/app` the dashboard, client-rendered, gated behind a connected wallet
- Wallet connect handled through a Celo-aware connector, supporting MiniPay's in-app browser, Valora, WalletConnect, and MetaMask as a fallback
- Live dashboard subscribes to the agent service for usage and settlement updates, either short-poll on an interval or a lightweight websocket if time allows, polling is the safer choice given the deadline

**State**
- Wallet address and connection status held client-side
- Session id issued by the backend on session start, stored client-side for the duration of the session
- No client-side persistence beyond the active session, refreshing the page should require reconnecting, this matches the mocked flow already in the prototype

**Key screens**
- Landing page, already built
- Wallet connect modal, already built
- Dashboard: balance card, spending limit control, live meter, settlement log

## 3. Backend, Agent Service

**Stack:** Node, TypeScript, a small service, not a full framework unless one is already comfortable, Express or Fastify is enough.

**Responsibilities**
- Own the usage feed generator
- Price each usage event
- Trigger x402 settlement per priced event
- Persist usage events and settlements
- Expose the internal API the frontend reads from

**Usage feed**
- Runs per active session
- Emits discrete events on an interval, each with a unit type, quantity, and timestamp
- Structured as its own module so a real feed, an actual sensor or metered API call, can replace it later without touching pricing or settlement code

**Pricing**
- A simple, fixed rate per unit type at launch, cKES or cUSD per liter, per minute, or per MB, whichever unit type is demoed
- Structured behind a single `getPrice(unitType, quantity)` function so it can become dynamic later without a rewrite

**Settlement**
- Tapa's backend acts as the resource server, it returns HTTP 402 when a priced usage event needs to be paid, and forwards the payment payload to the x402.celo.org facilitator, which verifies and settles it
- Setup, once, before any real settlement happens: connect a wallet to x402.celo.org, sign a message, no gas required, receive an API key instantly
- Deposit USDC into x402.celo.org to buy prepaid credits, this is what lets settlement happen gaslessly, one credit settles one payment, so credit balance needs monitoring during the hackathon window
- Attribution for Track 2, per the hackathon page and confirmed directly in the hackathon Telegram group, is the agent's payTo wallet address, `0x4c585c153bcd58b3fc94515b6cd7f1d4add9bdb0`, submitted as the x402 payment receiver address. Every settlement to or from that wallet is counted automatically by the facilitator, since the facilitator sends the settlement transaction itself it cannot carry a manual tag. Resolved, this is the mechanism Tapa uses, not the `toDataSuffix` tag method.
- Settlement result, success or failure, is written back to the `settlements` table with the transaction hash

## 3.5 Track 2 Strategy, Volume

Track 2 pays out on raw settlement count, not amount and not quality. This changes how the usage feed and session behavior should be tuned, separate from what makes a good demo.

**Leaderboard**
Live and public at `dune.com/celo/agentic-payments-defai-hackathon`. Attribution is retroactive once the agent or payTo wallet is added to the submission, but the sooner it's on every transaction, the sooner volume starts counting. Check this periodically during the build window, not just at the end.

**What actually moves the count**
- Usage event frequency should be as tight as is defensible for the unit type being metered, more small events beat fewer large ones, since count is all that matters here, not size
- Sessions should run as continuously as possible across the whole hackathon window, not only during live demos, idle time is volume not accumulated
- The payTo wallet must be registered in the submission as early as possible, unregistered settlements don't count toward the leaderboard even though attribution is retroactive once added
- The demo shown to judges can run at a slower, more readable pace, background metering does not need to match that pace, it should run faster

**What this does not change**
Every settlement still corresponds to a real, distinct usage event. The frequency tuning above is about pacing, not about faking volume, that distinction is the whole point of Tapa's pitch on this track.

## 4. Database

**Provider:** Postgres, Supabase, consistent with the toolchain already used on other projects.

**Schema** (see `tapa-prd.md` section 10 for the full table list, repeated here with types)

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  created_at timestamptz default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  spending_limit numeric not null,
  status text not null default 'active', -- active, ended, limit_reached
  started_at timestamptz default now(),
  ended_at timestamptz
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  unit_type text not null, -- water, solar, data
  quantity numeric not null,
  occurred_at timestamptz default now()
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  usage_event_id uuid references usage_events(id),
  amount numeric not null,
  currency text not null,
  tx_hash text,
  status text not null default 'pending', -- pending, confirmed, failed
  settled_at timestamptz
);
```

**Notes**
- `usage_events` and `settlements` are separate so a failed settlement never hides that usage occurred, this matters for honesty in the demo and for any later reconciliation

## 5. Authentication

There is no username and password layer. Identity is the connected wallet address.

- On wallet connect, the frontend receives the wallet address from the connector
- The backend looks up or creates a `users` row keyed on `wallet_address`
- No signature-based login flow is required for this MVP, session state is tied to the wallet address for the duration of the browser session, a full sign-in-with-Ethereum-style signature challenge is a reasonable Nice to Have if time allows, but is not required for the demo to function
- Disconnecting the wallet client-side ends the session

## 6. APIs

### Internal (agent service, consumed by frontend)

**`POST /session/start`**
Request: `{ wallet_address: string, spending_limit: number }`
Response: `{ session_id: string }`

**`POST /usage/event`** (internal trigger, called by the usage feed generator, not the frontend directly)
Request: `{ session_id: string, unit_type: string, quantity: number }`
Response: `{ usage_event_id: string, price: number }`

**`GET /session/:id/log`**
Response:
```json
{
  "session_id": "...",
  "status": "active",
  "total_settled": 2.14,
  "events": [
    { "unit_type": "water", "quantity": 0.6, "amount": 0.03, "tx_hash": "0x...", "occurred_at": "..." }
  ]
}
```

**`POST /session/:id/end`**
Response: `{ status: "ended" }`

### External

- **Celo x402 facilitator**, `x402.celo.org`, verifies and settles the payment payload forwarded by Tapa's server, requires an API key obtained by connecting a wallet and signing a message, and prepaid USDC credits to cover gasless settlement
- **Celo RPC**, used to read wallet balance and confirm transaction status
- **Wallet connectors**, MiniPay, Valora, WalletConnect, MetaMask, used client-side for wallet identity and signing
- **Block explorer**, used to generate a verifiable link per settlement, so judges can check a transaction independently

## 7. Deployment

**Frontend:** Vercel, native fit for Next.js, fast to redeploy during the build window

**Agent service:** Render, matches the pattern already used on prior projects for small backend services

**Database:** Supabase, hosted Postgres, matches the pattern already used on a prior project

**Environment variables**
- `X402_FACILITATOR_URL`, `https://api.x402.celo.org`
- `X402_API_KEY`, obtained by connecting a wallet at x402.celo.org and signing a message, no gas required
- `X402_PAYTO_WALLET`, `0x4c585c153bcd58b3fc94515b6cd7f1d4add9bdb0`, this address must be registered in the hackathon submission for Track 2 attribution
- `HACKATHON_ATTRIBUTION_TAG`, `celo_5057b1f83b80`, issued at registration, not used for Track 2 settlement, see resolved note in section 3.5

**Registration status, confirmed**
- Registered for Agentic Payments and DeFAI Hackathon, Track: Most x402 Payments
- GitHub linked: `github.com/solutionkanu12/tapa`
- Attribution mechanism confirmed via hackathon Telegram group: submit the x402 payment receiver address (payTo wallet), not a transaction tag
- Still outstanding before final submission, not required for building: hackathon Telegram group join, tagline, description, X/Twitter post about the submission, ERC-8004 ID URL, agent wallet address confirmation, `celoNetwork: celo-mainnet` confirmation
- `CELO_RPC_URL`
- `DATABASE_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

**Build order for deployment**
1. Stand up the database and run the schema
2. Deploy the agent service with environment variables set, confirm `/session/start` and `/usage/event` work against a test session
3. Deploy the frontend pointed at the agent service's public URL
4. Confirm a full session end to end against the deployed stack, not just locally, before judging begins

## 8. Tech Stack Summary

| Layer | Choice |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind |
| Backend | Node, TypeScript, Express or Fastify |
| Database | Postgres, Supabase |
| Auth | Wallet address as identity, no password layer |
| Settlement | x402 via x402.celo.org |
| Wallets | MiniPay, Valora, WalletConnect, MetaMask |
| Frontend host | Vercel |
| Backend host | Render |
