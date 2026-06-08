package com.rootrecord.businessmanager;

import android.content.SharedPreferences;
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
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
  private static final String AD_PREFS = "businessmanager_ads";
  private static final String KEY_ACTION_COUNT = "action_count";
  private static final int ACTIONS_PER_INTERSTITIAL = 50;

  private static final String AD_FREE_JS =
      "(function(){try{return localStorage.getItem('rrbm.plan')==='pro';}catch(e){return false;}})();";

  private static final int FALLBACK_BANNER_HEIGHT_DP = 50;

  /** No extra gap between banner bottom and first web row (avoids double spacing). */
  private static final int BANNER_TOP_GAP_DP = 0;

  private AdView adView;
  private boolean adLoaded;
  private boolean adFree;
  private InterstitialAd interstitialAd;
  private boolean interstitialLoading;
  private boolean showInterstitialWhenLoaded;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    MobileAds.initialize(this, initializationStatus -> {});

    ensureAdView();
    preloadInterstitialIfNeeded();

    mainHandler.post(this::attachWebAdsBridge);
    mainHandler.post(this::syncAdVisibilityFromWeb);
    mainHandler.postDelayed(this::syncAdVisibilityFromWeb, 500L);
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

  /**
   * Top padding for web content below the overlay banner. Use status bar + measured banner
   * height — window geometry (ad bottom − WebView top) can over-count and leave a large gap.
   */
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

  private SharedPreferences adPrefs() {
    return getSharedPreferences(AD_PREFS, MODE_PRIVATE);
  }

  private void onUserAction() {
    if (adFree) {
      return;
    }
    String unitId = BuildConfig.ADMOB_INTERSTITIAL_AD_UNIT_ID;
    if (unitId == null || unitId.isEmpty()) {
      return;
    }
    SharedPreferences prefs = adPrefs();
    int count = prefs.getInt(KEY_ACTION_COUNT, 0) + 1;
    if (count >= ACTIONS_PER_INTERSTITIAL) {
      prefs.edit().putInt(KEY_ACTION_COUNT, 0).apply();
      showInterstitialIfReady();
    } else {
      prefs.edit().putInt(KEY_ACTION_COUNT, count).apply();
      preloadInterstitialIfNeeded();
    }
  }

  private void preloadInterstitialIfNeeded() {
    if (adFree || interstitialAd != null || interstitialLoading) {
      return;
    }
    String unitId = BuildConfig.ADMOB_INTERSTITIAL_AD_UNIT_ID;
    if (unitId == null || unitId.isEmpty()) {
      return;
    }
    interstitialLoading = true;
    InterstitialAd.load(
        this,
        unitId,
        new AdRequest.Builder().build(),
        new InterstitialAdLoadCallback() {
          @Override
          public void onAdLoaded(InterstitialAd ad) {
            interstitialLoading = false;
            interstitialAd = ad;
            ad.setFullScreenContentCallback(
                new FullScreenContentCallback() {
                  @Override
                  public void onAdDismissedFullScreenContent() {
                    interstitialAd = null;
                    preloadInterstitialIfNeeded();
                  }

                  @Override
                  public void onAdFailedToShowFullScreenContent(AdError adError) {
                    interstitialAd = null;
                    preloadInterstitialIfNeeded();
                  }
                });
            if (showInterstitialWhenLoaded) {
              showInterstitialWhenLoaded = false;
              showInterstitialIfReady();
            }
          }

          @Override
          public void onAdFailedToLoad(LoadAdError loadAdError) {
            interstitialLoading = false;
            showInterstitialWhenLoaded = false;
          }
        });
  }

  private void showInterstitialIfReady() {
    if (adFree) {
      return;
    }
    InterstitialAd ad = interstitialAd;
    if (ad != null) {
      interstitialAd = null;
      ad.show(this);
    } else {
      showInterstitialWhenLoaded = true;
      preloadInterstitialIfNeeded();
    }
  }

  private void applyAdFree(boolean adFree) {
    this.adFree = adFree;
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

  /** Top padding for web = distance from WebView top to ad bottom (no double status-bar). */
  private void syncWebBannerInset() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    Runnable apply =
        () -> {
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
        };
    if (adView != null && adView.getVisibility() == View.VISIBLE) {
      adView.post(apply);
    } else {
      apply.run();
    }
  }

  private final class WebAdsBridge {
    @JavascriptInterface
    public void sync() {
      runOnUiThread(MainActivity.this::syncAdVisibilityFromWeb);
    }

    @JavascriptInterface
    public void recordAction() {
      runOnUiThread(MainActivity.this::onUserAction);
    }
  }
}
