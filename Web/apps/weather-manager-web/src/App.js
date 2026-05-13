import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AuthGate from './pages/AuthGate';
import Home from './pages/Home';
import Hazards from './pages/Hazards';
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
import { api, isBackendConfigured, session, tryHydrateSessionFromCookie } from './lib/api';
import { safeSessionStorage } from './lib/storage';
import useAccess from './lib/useAccess';

const IS_NATIVE = typeof window !== 'undefined' && Boolean(window?.Capacitor?.isNativePlatform?.());

/** FCM push registration calls into Firebase; without google-services.json the native app can crash. */
const ENABLE_NATIVE_PUSH = process.env.REACT_APP_ENABLE_PUSH === '1';

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

  /** Native only: register FCM token (opt-in — set REACT_APP_ENABLE_PUSH=1 when Firebase is configured). */
  useEffect(() => {
    if (!ENABLE_NATIVE_PUSH) return;
    if (!decided || (!authed && !guest)) return;
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
  }, [decided, authed, guest]);

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
      className="weather-web-main min-h-screen bg-app text-white lg:pl-56 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-8"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
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
