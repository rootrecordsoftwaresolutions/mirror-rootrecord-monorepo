package com.rootrecord.businessmanager;

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
  private static final String AD_FREE_JS =
      "(function(){try{return localStorage.getItem('rrbm.plan')==='pro';}catch(e){return false;}})();";

  private static final int FALLBACK_BANNER_HEIGHT_DP = 50;

  private AdView adView;
  private boolean adLoaded;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    MobileAds.initialize(this, initializationStatus -> {});

    ensureAdView();

    mainHandler.post(this::attachWebAdsBridge);
    mainHandler.postDelayed(this::syncAdVisibilityFromWeb, 1500L);
  }

  /** Capacitor uses its own bridge layout; attach a top banner if XML was not inflated. */
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

  /** Draw the banner below the status bar, not underneath it. */
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

  private int statusBarInsetPx() {
    if (adView == null) {
      return 0;
    }
    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(adView);
    if (insets == null) {
      return 0;
    }
    return insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
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
    adView.post(this::syncWebBannerInset);
  }

  /** Pushes web content below the native top banner (status bar + banner only, no extra gap). */
  private void syncWebBannerInset() {
    if (adView == null || adView.getVisibility() != View.VISIBLE) {
      applyWebBannerInset(0);
      return;
    }
    adView.post(
        () -> {
          int bannerPx = adView.getHeight();
          if (bannerPx <= 0) {
            bannerPx =
                (int)
                    (FALLBACK_BANNER_HEIGHT_DP * getResources().getDisplayMetrics().density + 0.5f);
          }
          applyWebBannerInset(statusBarInsetPx() + bannerPx);
        });
  }

  private void applyWebBannerInset(int insetPx) {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    if (insetPx <= 0) {
      webView.evaluateJavascript(
          "document.documentElement.style.removeProperty('--rr-native-ad-banner-height');", null);
      return;
    }
    webView.evaluateJavascript(
        "document.documentElement.style.setProperty('--rr-native-ad-banner-height','"
            + insetPx
            + "px');",
        null);
  }

  private final class WebAdsBridge {
    @JavascriptInterface
    public void sync() {
      runOnUiThread(MainActivity.this::syncAdVisibilityFromWeb);
    }
  }
}
