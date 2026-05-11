# Discord — beta round (Weather Manager 1.0.27 / versionCode 27)

Copy everything below the line into your Discord announcement (adjust **#weather-manager** to your server’s channel).

---

We’re opening another beta round on **Google Play** (Android). This release is **Weather Manager 1.0.27** with **versionCode 27**

**What this app is**
**Weather and hazard awareness** companion: **home** overview, **saved locations** and map-style flows, **hazards / alerts** (detail views when you drill in), **settings** (including notification-related options where enabled), **feedback**, and **developer messages**. Data comes from configured services and public sources as implemented in the app — **not** a replacement for **official warnings**; in any emergency, follow **civil defense and official instructions**.

**How to join**
1. Join the beta tester group **https://groups.google.com/u/1/g/rootrecordtesting**
2. Open the Play testing link: **https://play.google.com/apps/testing/com.rootrecord.weathermanager**
3. Accept the beta, install **Weather Manager**, leave auto-update on if you can.

**What to stress-test**
- First launch: auth / session behavior and getting to the main tabs
- **Home**: current conditions, refreshes, anything hours out of date or blank
- **Locations / map**: add/remove spots, GPS or map flows, odd behavior offline vs online
- **Hazards / alerts**: list loads, detail screens, tap-through from notifications if you enable them
- **Notifications** (if you turn them on): timely vs spammy vs silent
- **Settings** and **Feedback** paths
- General: crashes, jank, wrong strings, dark mode if you use it

**Privacy / permissions (high level)**
Internet (data), optional **location** (nearby / map / location-based weather), **notifications** (pushes when enabled in build). Account usage depends on your build/config — see in-app copy for what this beta expects.

**How to report issues**
Reply in **#weather-manager** with: **device model**, **Android version**, **app version** (Settings / About — or 1.0.27), **steps**, **screenshots** if UI. For crashes, note roughly **what you tapped** before it died.

Mahalo — your feedback shapes what ships next.
