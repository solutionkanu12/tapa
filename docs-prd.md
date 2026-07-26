# Tapa, Product Requirements Document

**Hackathon:** Celo Agentic Payments and DeFAI Hackathon
**Track:** Track 2, Most x402 Payments
**Deadline:** August 3, 9am GMT
**Status:** Draft for build, prototype and brand locked

---

## 1. Overview

Tapa is an agent that watches something being consumed in real time and pays for it the instant it is consumed, instead of waiting for a monthly bill. Usage happens, the agent prices that exact unit, and payment settles immediately through x402 on Celo.

The mechanism is not tied to one utility. Water, solar power, and mobile data are the first three usage types Tapa can meter, chosen because they map to real pay-as-you-go behavior that already exists in the world, just billed the slow way today.

## 2. Problem

Most pay-as-you-go systems still work like an invoice. A number arrives at the end of a billing period whether or not the person can pay it. This creates two problems:

- People who can afford small amounts in the moment get excluded by systems that demand a lump sum later.
- Digital payment systems built around agents currently reward raw transaction volume, which invites farmed, meaningless transactions rather than transactions tied to something real.

Tapa solves both by making every settlement correspond to a real, distinct unit of usage.

## 3. Goals

- Ship a working demo where every transaction on the live dashboard is a genuine, on-chain x402 settlement, not a simulated number.
- Generate settlement volume through honest usage, not a farmed loop, directly differentiating from likely competing Track 2 submissions.
- Deliver a demo judges can watch end to end in under two minutes: connect wallet, set a limit, watch usage generate real payments.

## 4. Success Criteria

| Criteria | Target |
|---|---|
| Live settlements during hackathon window | As many genuine, usage-tied settlements as possible between registration and Aug 3, 9am GMT |
| Attribution tag coverage | 100 percent of transactions carry the assigned attribution tag from day one of registration |
| Demo completion | A judge can go from landing page to a working settlement without any manual intervention from the team |
| Track fit | Every settlement is traceable to a specific, loggable usage event, not a repeated no-op transaction |
| Uptime during judging window | Deployed app reachable and functional for the full judging period |

## 5. User Personas

**Primary persona, the demo user (judge or tester)**
Wants to see the mechanism work in under two minutes. Connects a wallet, sees usage happen, sees money move. Does not need deep crypto literacy.

**Secondary persona, the eventual real user**
Someone who can pay small amounts as they go but not a lump sum later. Represented in the pitch, not necessarily built for in this MVP.

## 6. User Stories

- As a user, I want to connect a Celo-compatible wallet so that Tapa can settle payments on my behalf.
- As a user, I want to set a spending limit before usage starts so that I stay in control of what Tapa can spend.
- As a user, I want to see a live meter of what I am using so that I trust the number driving my payments.
- As a user, I want to see each individual payment as it happens, with amount, unit, and time, so that I know exactly what I paid for.
- As a user, I want to disconnect at any point so that metering and spending stop immediately.
- As a judge, I want to verify that a shown transaction is real by checking it on a block explorer so that I trust the demo is not faked.

## 7. Features

### Must Have
- Wallet connect for at least one Celo-compatible wallet, MiniPay prioritized
- A usage feed producing distinct, timestamped usage events, simulated is acceptable, but each event must be discrete and real, not one continuous fake counter
- Live pricing logic that computes a price for each usage event as it occurs
- Real x402 settlement fired per usage event, routed through the Celo x402 facilitator
- Live meter dial reflecting running usage in real time
- Settlement log listing each payment as it lands, with amount, unit, and timestamp
- A session spending limit set by the user before usage begins
- Attribution tag applied to every transaction
- Public, deployed URL
- Landing page explaining the mechanism, already built

### Nice to Have
- Multiple selectable usage types, water, solar, data, even if only one is fully wired to real settlement
- Wallet balance pulled live from the connected wallet rather than hardcoded
- Session state that persists briefly across a reconnect
- A visible pricing control so judges can see the price is computed, not hardcoded
- Basic in-UI error states for insufficient balance or failed settlement
- An embedded short demo clip on the landing page

### Future Features, out of scope for this submission
- Real hardware or IoT-based metering
- Demand-based dynamic pricing
- Multi-user accounts with history and analytics
- Integration with real utility or PAYGo operators
- Askbots and Aigora bounty integration, pursued as a separate effort if time allows
- A native mobile app
- Support for chains and wallets beyond Celo

## 8. User Flow

1. **Landing page.** User reads the pitch, clicks Open the tap.
2. **Wallet connect modal.** User picks a wallet, MiniPay, Valora, MetaMask, or WalletConnect.
3. **Connecting state.** Brief loading state while the wallet connection is established.
4. **Dashboard entry.** View swaps entirely from landing page to dashboard, matching the pattern used on prior projects, not just a nav update.
5. **Set a limit.** User sets the maximum Tapa can spend for the session.
6. **Usage begins.** The usage feed starts emitting events. Each event is priced and settled through x402 in real time.
7. **Live feedback.** The meter dial updates, the settlement log appends a new row per settlement.
8. **Limit reached or user stops.** Metering halts, either automatically at the limit or manually on disconnect.
9. **Disconnect.** User returns to the landing page. Session state clears.

## 9. Technical Architecture

**Frontend**
- Static or lightly server-rendered web app, matching the existing prototype's structure
- Wallet connect handled client-side, Celo-compatible wallet SDKs or WalletConnect
- Live dashboard polling or subscribing to settlement events for real-time UI updates

**Agent and Pricing Layer**
- A small service that receives usage events, computes a price per event, and triggers the x402 payment request
- Pricing logic can start as a fixed rate per unit type, structured so it can later be made dynamic without a rewrite

**Usage Feed**
- A generator producing discrete usage events on a realistic cadence, standing in for a real meter or sensor
- Each event carries a unit type, quantity, and timestamp

**Settlement Layer**
- Integration with the Celo x402 facilitator, x402.celo.org, to route and settle each priced usage event
- Attribution tag attached at the point of request, per the hackathon's registration requirement

**Deployment**
- Same pattern as prior projects, deployed to a public host, reachable without local setup

## 10. Database Requirements

Even with a simulated usage feed, real data needs to persist so the settlement log and dashboard reflect true history rather than only the current session.

**Tables**

`users`
- id
- wallet_address
- created_at

`sessions`
- id
- user_id
- spending_limit
- status, active, ended, limit_reached
- started_at
- ended_at

`usage_events`
- id
- session_id
- unit_type, water, solar, data
- quantity
- occurred_at

`settlements`
- id
- usage_event_id
- amount
- currency
- tx_hash
- attribution_tag
- status, pending, confirmed, failed
- settled_at

This structure keeps usage and payment as separate, joinable records, which matters both for the live dashboard and for any post-hackathon reporting judges or teammates might want to review.

## 11. APIs

**External**
- Celo x402 facilitator, x402.celo.org, for routing and settling payments
- Celo-compatible wallet connection, MiniPay, Valora, WalletConnect, MetaMask
- Celo RPC endpoint for reading wallet balance and confirming transaction status
- Block explorer link generation for transaction verification, so judges can check a settlement independently

**Internal**
- `POST /session/start`, creates a session with a spending limit
- `POST /usage/event`, ingests a single usage event and triggers pricing
- `POST /settlement/trigger`, fires the x402 settlement for a priced usage event
- `GET /session/:id/log`, returns the running settlement log for the live dashboard
- `POST /session/:id/end`, ends a session and stops the usage feed

## 12. Risks and Open Questions

- Confirm whether the usage feed being simulated rather than hardware-driven is acceptable for Track 2 eligibility, the hackathon page states eligibility is open to anything built during the hackathon window settling real x402 payments, so the feed itself being simulated should be fine as long as the resulting settlements are genuine.
- Attribution tag must be registered on day one to avoid losing early volume from the leaderboard.
- Wallet connect reliability across MiniPay, Valora, and WalletConnect needs early testing, this is the most likely point of demo failure.
- Pricing logic should stay simple enough to build reliably in the time remaining, complexity here is a Future Feature, not a Must Have.

---

Prototype reference: `tapa-prototype.html`, brand system and UX flow already built and matches this PRD.
