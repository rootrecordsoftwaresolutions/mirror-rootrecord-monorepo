import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';
import { Inter, Instrument_Serif } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { Toaster } from 'sonner';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ReferralCapture } from '@/components/ReferralCapture';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';
import { SEO_MASTER_KEYWORDS } from '@/lib/seo';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

const SITE_URL_FALLBACK = 'https://solana.rootrecord.info';

/** Public site URL for OpenGraph / metadataBase; host-only values are normalized. */
function metadataBaseUrl(): URL {
  const trimmed = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!trimmed) return new URL(SITE_URL_FALLBACK);
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return new URL(SITE_URL_FALLBACK);
    }
    return u;
  } catch {
    return new URL(SITE_URL_FALLBACK);
  }
}

const SITE = metadataBaseUrl();

const SOCIAL_IMAGE_PATH = '/brand.jpg';

/** Override via `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` if Search Console rotates the token. */
const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ||
  'ODUjEogoHQ7G5UBPR3sy5ESJ-gKo47hgy35OHV4ecrs';

export const metadata: Metadata = {
  metadataBase: SITE,
  applicationName: 'RootRecord Solana Tools',
  title: {
    default: 'Create Solana Token | RootRecord Solana Tools',
    template: '%s | RootRecord Solana Tools',
  },
  description:
    "The easiest way to create a Solana token (SPL) in seconds. Use RootRecord's high-speed infrastructure to deploy tokens and manage on-chain assets.",
  keywords: [...SEO_MASTER_KEYWORDS],
  authors: [{ name: 'RootRecord', url: 'https://rootrecord.info' }],
  creator: 'RootRecord',
  formatDetection: { email: false, address: false, telephone: false },
  referrer: 'strict-origin-when-cross-origin',
  icons: {
    icon: [{ url: SOCIAL_IMAGE_PATH, type: 'image/jpeg' }],
    apple: [{ url: SOCIAL_IMAGE_PATH, type: 'image/jpeg' }],
  },
  openGraph: {
    title: 'Create Solana Token | RootRecord Solana Tools',
    description:
      'The easiest way to create a Solana token (SPL) in seconds. Deploy SPL & Token-2022 mints, manage authorities & metadata, Raydium liquidity, bulk sends — low flat SOL fees.',
    url: SITE.href.replace(/\/$/, ''),
    siteName: 'RootRecord Solana Tools',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: SOCIAL_IMAGE_PATH,
        alt: 'RootRecord Solana Tools',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@rootrecord',
    creator: '@rootrecord',
    title: 'Create Solana Token | RootRecord Solana Tools',
    description:
      'Create a Solana token (SPL) in seconds. Deploy tokens and manage on-chain assets with flat SOL fees.',
    images: [SOCIAL_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  verification: {
    google: GOOGLE_SITE_VERIFICATION,
  },
};

export const viewport: Viewport = {
  themeColor: '#06090F',
  width: 'device-width',
  initialScale: 1,
};

const CF_WEB_ANALYTICS_TOKEN =
  process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN?.trim() ||
  'a09f914edc5a428282e32a75198a0921';

const GTM_ID = 'GTM-5FWZH64B';

/** Inline bootstrap — loads before interactive per GTM install guidance. */
const GTM_HEAD_SNIPPET =
  `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':` +
  `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],` +
  `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=` +
  `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
  `})(window,document,'script','dataLayer','${GTM_ID}');`;

/**
 * Wallet Standard registers wallets on first paint; calling that registry during SSR can throw
 * in some runtimes and surfaces as a generic "Application error" on routes like /tools.
 */
const SolanaProviders = dynamic(
  () => import('@/components/providers/SolanaProviders').then((m) => m.SolanaProviders),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[50vh] flex-1 flex-col"
        aria-busy="true"
        aria-label="Loading wallet connection"
      />
    ),
  },
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrument.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Google Tag Manager — as high in <head> as practical in App Router */}
        <Script id="google-tag-manager" strategy="beforeInteractive">
          {GTM_HEAD_SNIPPET}
        </Script>
      </head>
      <body className="font-sans min-h-screen flex flex-col antialiased">
        {/* Google Tag Manager (noscript) — immediately after opening <body> */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height={0}
            width={0}
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
        <SiteJsonLd />
        <SolanaProviders>
          <ReferralCapture />
          <Header />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          <Footer />
          <Toaster
            theme="dark"
            position="bottom-center"
            toastOptions={{
              style: {
                background: '#0A0F1A',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#E6EAF2',
              },
            }}
          />
        </SolanaProviders>
        <Script
          id="cloudflare-beacon"
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon={JSON.stringify({ token: CF_WEB_ANALYTICS_TOKEN })}
        />
        <Analytics />
      </body>
    </html>
  );
}
