# Pitch (written week 1, before code — P8)

## Problem

Smallholders (200–500kg each) are invisible to bulk buyers (10T+). Buyers don't trust 100 tiny suppliers; farmers can't price, negotiate, invoice, or collect. Deals die; distributors capture the margin.

## Solution

FarmBroker AI is an autonomous procurement platform. Buyer requests supply; AI scores feasibility, prices, collects PayPal payment, assembles multi-supplier coverage AFTER payment, inspects at the Hub, splits settlement, and delivers a completed order. We sell Guaranteed Supply — buyers purchase outcomes.

## Why AI

AI is the brain, not a chatbot: Demand parses, Risk scores (92%), Pricing floors quotes, Procurement allocates, Quality grades, Finance splits. Remove AI → no score, price, allocation, grade, or split. Product dies (kill test YES).

## Why PayPal

PayPal is the heart: buyer pays the PLATFORM (Sandbox Orders v2 → capture), which unlocks procurement and guarantees settlement. Remove PayPal → no paid gate, no procurement, no deal. Project collapses (kill test YES). Suppliers are never PayPal payees in MVP (internal simulation, labeled).

## Market

Millions of smallholders + food buyers (restaurants, chains, processors) per region; wedge = herbs/vegetables (Mint/Basil/Lettuce), expandable to any commodity (fish, raw materials) — same procurement machine.

## Demo Flow (160s)

Request 10T → 92% → Quote 78,000 → PayPal Success → 10/10 procurement → Hub inspection (Risk=Supplier→Platform, Insured) → Passed→Released split → Completed. Narratives on screen + spoken.

## Future

Export agent (English offers, UAE/Saudi/Germany), real payouts via PayPal Payouts, insurer API replacing simulated coverage, carrier integrations (all BACKLOG, never MVP).

## Narratives (P9 verbatim)

"The buyer requested supply. The AI sourced it. The platform guaranteed it. PayPal secured the transaction." / "FarmBroker AI transforms fragmented agricultural supply into guaranteed fulfillment. Buyers purchase outcomes. AI handles sourcing, quality, supplier coordination, and financial settlement. PayPal secures the transaction."

---
*Stack frozen: Next.js / Node.js / Supabase / AI best-free-key (OpenRouter) / PayPal Sandbox (USD) / Vercel. No changes later.*
