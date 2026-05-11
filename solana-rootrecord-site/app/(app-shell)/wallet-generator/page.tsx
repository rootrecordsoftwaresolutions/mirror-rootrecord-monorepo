import type { Metadata } from 'next';

import { WalletGeneratorJsonLd } from '@/components/seo/WalletGeneratorJsonLd';
import { WalletGeneratorClient } from './WalletGeneratorClient';
import { WalletIntro } from './WalletIntro';
import { flattenSeoKeywordBuckets, pageSeo, pickSeoKeywords } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return pageSeo({
    path: '/wallet-generator',
    title: 'Solana paper wallet generator — QR print',
    description:
      'Free Solana paper wallet generator in the browser: random keypair (not BIP-39 HD), tent-fold printable sheet with public + private QR codes, base58 keys, and fingerprint ID. Print menu: save ink, vivid, premium dark, or warm paper — keys never leave your tab.',
    keywords: flattenSeoKeywordBuckets(pickSeoKeywords('core', 'paperWallet'), [
      'warm paper print',
      'vivid paper wallet',
      'premium dark wallet print',
      'not BIP39 HD wallet',
    ]),
  });
}

export default function WalletGeneratorPage() {
  return (
    <>
      <WalletGeneratorJsonLd />
      <WalletIntro />
      <WalletGeneratorClient />
    </>
  );
}
