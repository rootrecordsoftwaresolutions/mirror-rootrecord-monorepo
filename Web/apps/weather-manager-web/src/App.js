import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AuthGate from './pages/AuthGate';
import Home from './pages/Home';
import Hazards from './pages/Hazards';
import AirQuality from './pages/AirQuality';
import Settings from './pages/Settings';
import Feedback from './pages/Feedback';
import LocationMap from './pages/LocationMap';
import TabBar from './components/TabBar';
import GuestBanner from './components/GuestBanner';
import ProPaywall from './components/ProPaywall';
import UpsellModal from './components/UpsellModal';
import DeveloperMessages from './pages/DeveloperMessages';
import AlertDetail from './pages/AlertDetail';
import About from './pages/About';
import { api, isBackendConfigured, RR_APP_ID, session, tryHydrateSessionFromCookie } from './lib/api';
import { notifyAppSessionStart, ROOTRECORD_ACCOUNT_API_ORIGIN } from '../../shared/accountNotifyApi';
import { safeSessionStorage } from './lib/storage';
import useAccess from './lib/useAccess';
import { refreshSessionAccess } from './lib/tierAccess';

const IS_NATIVE = typeof window !== 'undefined' && Boolean(window?.Capacitor?.isNativePlatform?.());

/**
 * FCM push registration (native Android). Enabled when REACT_APP_ENABLE_PUSH=1, or on
 * production builds unless explicitly disabled (REACT_APP_ENABLE_PUSH=0).
 * Requires google-services.json in the Android project.
 */
const ENABLE_NATIVE_PUSH =
  process.env.REACT_APP_ENABLE_PUSH === '1' ||
  (process.env.NODE_ENV === 'production' && process.env.REACT_APP_ENABLE_PUSH !== '0');

function useGate() {
  const [decided, setDecided] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await tryHydrateSessionFromCookie();
      } finally {
        if (!cancelled) {
          setAuthed(session.isAuthed());
          setGuest(false);
          setDecided(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Response interceptor clears the local session when the server rejects the Bearer.
  // Listen for the clearSession dispatch so the AuthGate re-renders without a manual reload.
  useEffect(() => {
    const onAccess = () => setAuthed(session.isAuthed());
    window.addEventListener(session.ACCESS_EVENT, onAccess);
    return () => window.removeEventListener(session.ACCESS_EVENT, onAccess);
  }, []);

  return { decided, authed, guest, setAuthed, setGuest };
}

export default function App() {
  const { decided, authed, guest, setAuthed, setGuest } = useGate();
  const { pro, life } = useAccess();
  const location = useLocation();
  const hideTabs =
    location.pathname.startsWith('/auth') ||
    location.pathname.startsWith('/locations/new') ||
    location.pathname.startsWith('/feedback') ||
    location.pathname.startsWith('/developer-messages') ||
    location.pathname.startsWith('/about') ||
    location.pathname.startsWith('/alert');

  /** Keep Pro / Lifetime flags in sync with the server after sign-in or billing changes. */
  useEffect(() => {
    if (!decided || !authed) return;
    refreshSessionAccess();
  }, [decided, authed]);

  /** Discord: signed-in session start (account Worker → `DISCORD_APP_SESSION_WEBHOOK_URL`). */
  useEffect(() => {
    if (!decided || !authed) return;
    notifyAppSessionStart({
      apiOrigin: ROOTRECORD_ACCOUNT_API_ORIGIN,
      appId: RR_APP_ID,
      betaTester: false,
      guestId: session.guestId(),
      getAuthToken: () => session.getToken(),
      includeCredentials: !IS_NATIVE,
    });
  }, [decided, authed]);

  /** Best-effort: record latest device coordinates once per app session (MongoDB via FastAPI). */
  useEffect(() => {
    if (!decided || (!authed && !guest)) return;
    if (!isBackendConfigured()) return;
    if (safeSessionStorage.getItem('rrwm.deviceLocationAttempted')) return;
    safeSessionStorage.setItem('rrwm.deviceLocationAttempted', '1');
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.reportDeviceLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
          });
        } catch {
          /* ignore */
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  }, [decided, authed, guest]);

  /** Native only: register FCM token for Pro / Lifetime (server also enforces on /me/push-token). */
  useEffect(() => {
    if (!ENABLE_NATIVE_PUSH) return;
    if (!decided || !authed) return;
    if (!pro && !life) return;
    if (!isBackendConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;
        await PushNotifications.addListener('registration', async ({ value }) => {
          if (cancelled || !value) return;
          try {
            await api.registerPushToken({ token: value, platform: Capacitor.getPlatform() });
          } catch (e) {
            console.warn('registerPushToken', e);
          }
        });
        await PushNotifications.addListener('registrationError', (err) => {
          console.warn('push registrationError', err);
        });
        await PushNotifications.register();
      } catch (e) {
        console.warn('push setup', e);
      }
    })();
    return () => {
      cancelled = true;
      (async () => {
        try {
          const { Capacitor } = await import('@capacitor/core');
          if (!Capacitor.isNativePlatform()) return;
          const { PushNotifications } = await import('@capacitor/push-notifications');
          await PushNotifications.removeAllListeners();
        } catch {
          /* ignore */
        }
      })();
    };
  }, [decided, authed, pro, life]);

  if (!decided) return <div className="h-screen w-screen bg-app" />;
  // Sign-in required.

  // Web: Pro-only. Native (Capacitor Android) apps run free-with-restrictions; no paywall there.
  const allowAppShell = pro || life || IS_NATIVE;
  if (authed && !allowAppShell && !location.pathname.startsWith('/auth')) {
    return (
      <ProPaywall
        onSignOut={() => {
          session.clearSession();
          setAuthed(false);
          setGuest(false);
        }}
      />
    );
  }

  return (
    <div
      className="weather-web-main min-h-screen bg-app text-white lg:pl-56 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-8 pt-[max(env(safe-area-inset-top,0px),var(--rr-native-ad-banner-height,0px))]"
    >
      <GuestBanner />
      <Routes>
        <Route
          path="/auth"
          element={authed ? <Navigate to="/" replace /> : <AuthGate onSignedIn={() => { setAuthed(true); }} />}
        />
        {!authed ? (
          <>
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Home />} />
            <Route path="/hazards" element={<Hazards />} />
            <Route path="/air-quality" element={<AirQuality />} />
            <Route path="/rootrecord" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<Settings onSignedOut={() => { setAuthed(false); setGuest(false); }} />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/about" element={<About />} />
            <Route path="/developer-messages" element={<DeveloperMessages />} />
            <Route path="/locations/new" element={<LocationMap />} />
            <Route path="/alert" element={<AlertDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
      {!hideTabs && <TabBar />}
      {authed && <UpsellModal />}
    </div>
  );
}
