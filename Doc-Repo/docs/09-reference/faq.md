# Frequently asked questions

## What is RootRecord?

A software company shipping **mobile-first productivity apps** (business + weather), **account services**, **billing**, and **Solana tooling**, unified under one brand.

## Is RootRecord open source?

Some artifacts may appear on GitHub (releases, installers). **Availability varies by product**—check official links on rootrecord.info.

## Where is the API?

**`https://api.rootrecord.info`** — Cloudflare Worker `rootrecord-primary`.

## Where is the Solana app?

**`https://solana.rootrecord.info`**, built from **`RootRecord/solana-rootrecord-site`**.

## Do you custody my seed phrase?

**No** for Token Manager / standard wallet flows—those are **non-custodial**. Custodial features, if offered, are **separate** flows with explicit UX.

## Which repo do I clone for mobile?

**Mobile-Development-2026** (pnpm workspace).

## Why are there two git roots?

Historical separation: mobile release cadence and web infra deploy **differ**; forcing one mono-git would couple unrelated permissions and CI.

## How do I report a security issue?

Follow the organization’s security disclosure policy (add link when published). Do **not** open public issues with live exploits.

## Related reading

- [../01-introduction/what-is-rootrecord.md](../01-introduction/what-is-rootrecord.md)
