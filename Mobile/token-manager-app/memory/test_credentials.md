# Test credentials — RootRecord Token Manager

This app is **non-custodial**. There is no auth, no password, no JWT.
The Solana public key IS the identity.

## For automated tests / preview

Use these well-known valid base58 32-byte Solana public keys:

| Purpose | Pubkey |
|---|---|
| System Program (always exists, mainnet) | `11111111111111111111111111111111` |
| Test wallet 1 | `HXk3aFzLwVWqBz2eVrRq3fKoFMq6WjkP8mC9N2abF1Ax` |
| Test wallet 2 | `5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1` |

## Watch-mode flow

1. Open the app → Connect screen.
2. Paste any valid Solana pubkey (e.g. `11111111111111111111111111111111`) into the **Watch an address** input.
3. Tap **Watch address**. The app navigates to `/dashboard` in read-only mode (the `WATCHING` badge appears, Send button is disabled).

## Phantom mode

Requires the Phantom browser extension or in-app browser. The app uses `window.solana` / `window.phantom.solana`. Never asks for seed phrase or private key.
