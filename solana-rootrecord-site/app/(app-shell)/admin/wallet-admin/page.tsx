import type { Metadata } from 'next';

import { DevWalletAdminClient } from '@/components/admin/DevWalletAdminClient';

export const metadata: Metadata = {
  title: 'Wallet Admin (Dev)',
  description: 'Dev-only custodial wallet admin utilities.',
  robots: { index: false, follow: false },
};

export default function DevWalletAdminPage() {
  return <DevWalletAdminClient />;
}

