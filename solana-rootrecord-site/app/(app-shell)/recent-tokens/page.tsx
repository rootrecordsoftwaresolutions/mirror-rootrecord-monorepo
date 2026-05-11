import { permanentRedirect } from 'next/navigation';

/** Legacy URL; the worker-backed feed was unreliable — send users to the hub. */
export default function RecentTokensRedirectPage() {
  permanentRedirect('/dashboard');
}
