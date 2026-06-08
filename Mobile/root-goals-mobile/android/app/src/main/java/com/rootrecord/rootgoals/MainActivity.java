package com.rootrecord.rootgoals;

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

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

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

public class MainActivity extends BridgeActivity {
  private static final String AD_PREFS = "rootgoals_ads";
  private static final String KEY_ACTION_COUNT = "action_count";
  private static final int ACTIONS_PER_INTERSTITIAL = 50;
  private static final int FALLBACK_BANNER_HEIGHT_DP = 50;
  private static final int BANNER_TOP_GAP_DP = 0;

  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private AdView adView;
  private boolean bannerLoaded;
  private InterstitialAd interstitialAd;
  private boolean interstitialLoading;
  private boolean showInterstitialWhenLoaded;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    MobileAds.initialize(this, initializationStatus -> {});

    ensureAdView();
    preloadInterstitialIfNeeded();

    mainHandler.post(this::attachWebAdsBridge);
    mainHandler.postDelayed(this::syncWebBannerInset, 400L);
  }

  @Override
  public void onResume() {
    super.onResume();
    if (adView != null && adView.getVisibility() == View.VISIBLE) {
      adView.resume();
    }
  }

  @Override
  public void onDestroy() {
    if (adView != null) {
      adView.destroy();
    }
    super.onDestroy();
  }

  private void ensureAdView() {
    if (adView != null) {
      return;
    }
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
    int widthDp =
        (int)
            (getResources().getDisplayMetrics().widthPixels
                / getResources().getDisplayMetrics().density);
    adView.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp));
    String bannerId = BuildConfig.ADMOB_BANNER_AD_UNIT_ID;
    if (bannerId == null || bannerId.isEmpty()) {
      return;
    }
    adView.setAdUnitId(bannerId);
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
    adView.setVisibility(View.VISIBLE);
    if (!bannerLoaded) {
      adView.loadAd(new AdRequest.Builder().build());
      bannerLoaded = true;
    }
  }

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

  private int webTopInsetBelowAdPx() {
    if (adView == null || adView.getVisibility() != View.VISIBLE) {
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
            int insetPx = webTopInsetBelowAdPx();
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

  private SharedPreferences adPrefs() {
    return getSharedPreferences(AD_PREFS, MODE_PRIVATE);
  }

  private void onUserAction() {
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
    if (interstitialAd != null || interstitialLoading) {
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
    InterstitialAd ad = interstitialAd;
    if (ad != null) {
      interstitialAd = null;
      ad.show(this);
    } else {
      showInterstitialWhenLoaded = true;
      preloadInterstitialIfNeeded();
    }
  }

  private final class WebAdsBridge {
    @JavascriptInterface
    public void sync() {
      runOnUiThread(MainActivity.this::syncWebBannerInset);
    }

    @JavascriptInterface
    public void recordAction() {
      runOnUiThread(MainActivity.this::onUserAction);
    }
  }
}
