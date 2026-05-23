package com.rootrecord.weathermanager;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
  /** Hide banner only when signed in and Pro or lifetime (ignore stale pro flags for guests). */
  private static final String AD_FREE_JS =
      "(function(){try{var t=localStorage.getItem('rrwm.token');"
          + "if(!t)return false;return localStorage.getItem('rrwm.pro')==='1'"
          + "||localStorage.getItem('rrwm.life_member')==='1';}catch(e){return false;}})();";

  /** Small gap between the native banner bottom and the first web content row. */
  private static final int BANNER_TOP_GAP_DP = 4;

  private static final int FALLBACK_BANNER_HEIGHT_DP = 60;

  private AdView adView;
  private boolean adLoaded;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    MobileAds.initialize(this, initializationStatus -> {});

    ensureAdView();

    mainHandler.post(this::attachWebAdsBridge);
    mainHandler.post(this::syncAdVisibilityFromWeb);

    // Web session (localStorage) may not exist until after the Capacitor bundle loads.
    mainHandler.postDelayed(this::syncAdVisibilityFromWeb, 500L);
    mainHandler.postDelayed(this::syncAdVisibilityFromWeb, 1500L);

    View decor = getWindow() != null ? getWindow().getDecorView() : null;
    if (decor != null) {
      ViewCompat.requestApplyInsets(decor);
    }
  }

  /** Capacitor uses its own bridge layout; attach a top banner on the window if XML was not inflated. */
  private void ensureAdView() {
    if (adView != null) {
      return;
    }
    adView = findViewById(R.id.adView);
    if (adView == null) {
      ViewGroup content = findViewById(android.R.id.content);
      if (content == null) {
        return;
      }
      adView = new AdView(this);
      FrameLayout.LayoutParams params =
          new FrameLayout.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.WRAP_CONTENT,
              Gravity.TOP);
      content.addView(adView, params);
    }
    int widthDp =
        (int)
            (getResources().getDisplayMetrics().widthPixels
                / getResources().getDisplayMetrics().density);
    adView.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp));
    adView.setAdUnitId(BuildConfig.ADMOB_BANNER_AD_UNIT_ID);
    adView.setAdListener(
        new AdListener() {
          @Override
          public void onAdLoaded() {
            syncWebBannerInset();
          }

          @Override
          public void onAdFailedToLoad(LoadAdError error) {
            syncWebBannerInset();
          }
        });
    applyStatusBarMarginToAd();
  }

  /** Draw the banner below the status bar (time, icons), not underneath it. */
  private void applyStatusBarMarginToAd() {
    if (adView == null) {
      return;
    }
    ViewCompat.setOnApplyWindowInsetsListener(
        adView,
        (v, insets) -> {
          int top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
          ViewGroup.LayoutParams raw = v.getLayoutParams();
          if (raw instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) raw;
            if (lp.topMargin != top) {
              lp.topMargin = top;
              v.setLayoutParams(lp);
            }
          }
          syncWebBannerInset();
          return insets;
        });
    ViewCompat.requestApplyInsets(adView);
  }

  private void attachWebAdsBridge() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    webView.addJavascriptInterface(new WebAdsBridge(), "RootRecordAds");
    syncWebBannerInset();
  }

  @Override
  public void onResume() {
    super.onResume();
    syncAdVisibilityFromWeb();
  }

  @Override
  public void onDestroy() {
    if (adView != null) {
      adView.destroy();
    }
    super.onDestroy();
  }

  private void syncAdVisibilityFromWeb() {
    ensureAdView();
    if (adView == null) {
      return;
    }
    Bridge bridge = getBridge();
    if (bridge == null) {
      applyAdFree(false);
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      applyAdFree(false);
      return;
    }
    webView.evaluateJavascript(
        AD_FREE_JS, value -> runOnUiThread(() -> applyAdFree(isJsTruthy(value))));
  }

  private static boolean isJsTruthy(String value) {
    if (value == null || value.isEmpty() || "null".equals(value)) {
      return false;
    }
    return "true".equals(value) || "\"true\"".equals(value);
  }

  private void applyAdFree(boolean adFree) {
    if (adView == null) {
      return;
    }
    if (adFree) {
      adView.setVisibility(View.GONE);
      adView.pause();
      syncWebBannerInset();
      return;
    }
    adView.setVisibility(View.VISIBLE);
    if (!adLoaded) {
      adView.loadAd(new AdRequest.Builder().build());
      adLoaded = true;
    } else {
      adView.resume();
    }
    adView.post(MainActivity.this::syncWebBannerInset);
  }

  /** Status bar + banner height (window geometry can over-count and leave a large top gap). */
  private int webTopInsetBelowAdPx(WebView webView) {
    if (adView == null || webView == null || adView.getVisibility() != View.VISIBLE) {
      return 0;
    }
    int bannerPx = adView.getHeight();
    if (bannerPx <= 0) {
      bannerPx =
          (int) (FALLBACK_BANNER_HEIGHT_DP * getResources().getDisplayMetrics().density + 0.5f);
    }
    int gapPx = (int) (BANNER_TOP_GAP_DP * getResources().getDisplayMetrics().density + 0.5f);
    return statusBarInsetPx() + bannerPx + gapPx;
  }

  /** Status bar height for ad-free layout (WebView safe-area env is often 0 on Android). */
  private int statusBarInsetPx() {
    View decor = getWindow() != null ? getWindow().getDecorView() : null;
    if (decor != null) {
      WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
      if (insets != null) {
        return insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
      }
    }
    int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
    if (resId > 0) {
      return getResources().getDimensionPixelSize(resId);
    }
    return 0;
  }

  /**
   * Top padding for web content: banner bottom when ads show; status bar only when ad-free.
   * Never set the CSS variable to 0px — that blocks the safe-area fallback in the web bundle.
   */
  private void syncWebBannerInset() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    final String js;
    if (adView != null && adView.getVisibility() == View.VISIBLE) {
      int insetPx = webTopInsetBelowAdPx(webView);
      js =
          "document.documentElement.style.setProperty('--rr-native-ad-banner-height','"
              + insetPx
              + "px');";
    } else {
      int statusPx = statusBarInsetPx();
      if (statusPx > 0) {
        js =
            "document.documentElement.style.setProperty('--rr-native-ad-banner-height','"
                + statusPx
                + "px');";
      } else {
        js = "document.documentElement.style.removeProperty('--rr-native-ad-banner-height');";
      }
    }
    webView.evaluateJavascript(js, null);
  }

  /** Called from the web bundle after login / logout / `/v1/me` tier refresh. */
  private final class WebAdsBridge {
    @JavascriptInterface
    public void sync() {
      runOnUiThread(MainActivity.this::syncAdVisibilityFromWeb);
    }
  }
}
