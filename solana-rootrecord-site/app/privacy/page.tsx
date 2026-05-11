import type { Metadata } from 'next';

import { flattenSeoKeywordBuckets, pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/privacy',
  title: 'Privacy policy',
  description:
    'Privacy policy for RootRecord Solana Tools: what we collect (wallet public keys for transactions, optional IPFS uploads), analytics, and how we use data.',
  keywords: flattenSeoKeywordBuckets(pickSeoKeywords('core', 'ipfsMetadata'), [
    'privacy policy',
    'wallet public key',
    'analytics',
  ]),
});

export default function PrivacyPage() {
  return (
    <div className="container py-14 md:py-20 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Privacy
      </div>
      <h1 className="font-display text-4xl md:text-5xl tracking-tight">
        Your data, your devices.
      </h1>
      <div className="mt-8 space-y-4 text-muted-foreground leading-relaxed">
        <p>
          RootRecord Solana Tools is a fully client-side application. Your private
          keys never leave your wallet — every transaction is built and signed
          locally before being broadcast to the Solana network.
        </p>
        <p>
          We do not run analytics, we do not set tracking cookies, and we do not
          require an account to use the app. Referral codes from <code>?ref=</code>
          parameters are stored only in your own browser&apos;s localStorage.
        </p>
        <p>
          Logo and metadata files you upload are sent directly to Pinata (IPFS).
          Once content is on IPFS, it can be considered public.
        </p>
        <p>
          Questions? See{' '}
          <a className="text-sol-green hover:underline" href="https://rootrecord.info/privacy.html">
            rootrecord.info/privacy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
