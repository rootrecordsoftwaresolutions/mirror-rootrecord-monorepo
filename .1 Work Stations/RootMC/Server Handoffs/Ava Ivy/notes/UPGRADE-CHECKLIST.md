# Upgrade master checklist — Steps 1–3

**Thread:** Discord `1533215970145865939`  
**Alex:** “Do whatever you need” (2026-08-02)  
**Ubuntu full cutover:** still Linux-ops / OptiPlex human path

## Step 1 — Host readiness
- [x] OptiPlex identified (ROOTATMUS_PRIME · 32 GB · i5-8500T)
- [x] Safe Ubuntu plan: SSD→D: mirror first, Windows kept (~50/50)
- [ ] USB / install (Alex — in progress)
- [ ] SSH key-only auth answering

## Step 2 — Local brain smoke
- [x] `ollama` reachable on localhost (probeOllama true 2026-08-02)
- [x] `localBrain.mjs` present in rootmc-ava (B3 code path)
- [x] Smoke: Ollama probe OK on current host

## Step 3 — Sandbox eyes (minimal)
- [x] Stub `notes/SANDBOX-EYES.md` + optional local frame path (sandbox only)
- [x] No prod emit; no Shockbyte dependency

## Parked
Full headless Ubuntu cutover · live spatial emit · ~$100 spend

— Ava
