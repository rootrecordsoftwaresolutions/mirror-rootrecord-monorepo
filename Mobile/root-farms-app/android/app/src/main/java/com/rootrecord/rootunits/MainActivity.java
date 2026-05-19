package com.rootrecord.rootunits;

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
import com.google.android.gms.ads.OnUserEarnedRewardListener;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

public class MainActivity extends BridgeActivity {
  /** Hide banner for signed-in Pro / lifetime members (see Web localStorage). */
  private static final String AD_FREE_JS =
      "(function(){try{var t=localStorage.getItem('rrfarms.token');"
          + "if(!t)return false;return localStorage.getItem('rrfarms.pro')==='1'"
          + "||localStorage.getItem('rrfarms.life_member')==='1';}catch(e){return false;}})();";

  private static final int BANNER_TOP_GAP_DP = 4;
  private static final int FALLBACK_BANNER_HEIGHT_DP = 60;

  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private AdView adView;
  private boolean bannerLoaded;
  private RewardedAd rewardedAd;
  private boolean rewardedLoading;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    MobileAds.initialize(this, initializationStatus -> {});

    ensureAdView();
    loadRewardedAd();
    mainHandler.post(this::attachWebAdsBridge);

    View decor = getWindow() != null ? getWindow().getDecorView() : null;
    if (decor != null) {
      ViewCompat.setOnApplyWindowInsetsListener(
          decor,
          (v, insets) -> {
            pushSafeAreaInsets(insets);
            return insets;
          });
      ViewCompat.requestApplyInsets(decor);
    }

    mainHandler.postDelayed(this::pushSafeAreaInsetsFromDecor, 400L);
    mainHandler.postDelayed(this::syncAdVisibilityFromWeb, 500L);
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
      rewardedAd = null;
      syncWebBannerInset();
      return;
    }
    adView.setVisibility(View.VISIBLE);
    if (!bannerLoaded) {
      adView.loadAd(new AdRequest.Builder().build());
      bannerLoaded = true;
    } else {
      adView.resume();
    }
    adView.post(this::syncWebBannerInset);
    loadRewardedAd();
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

  private void loadRewardedAd() {
    if (rewardedLoading) {
      return;
    }
    String unitId = BuildConfig.ADMOB_REWARDED_AD_UNIT_ID;
    if (unitId == null || unitId.isEmpty()) {
      return;
    }
    rewardedLoading = true;
    RewardedAd.load(
        this,
        unitId,
        new AdRequest.Builder().build(),
        new RewardedAdLoadCallback() {
          @Override
          public void onAdLoaded(RewardedAd ad) {
            rewardedAd = ad;
            rewardedLoading = false;
            ad.setFullScreenContentCallback(
                new FullScreenContentCallback() {
                  @Override
                  public void onAdDismissedFullScreenContent() {
                    rewardedAd = null;
                    dispatchRewardedDismissed();
                    loadRewardedAd();
                  }

                  @Override
                  public void onAdFailedToShowFullScreenContent(AdError adError) {
                    rewardedAd = null;
                    dispatchRewardedDismissed();
                    loadRewardedAd();
                  }
                });
          }

          @Override
          public void onAdFailedToLoad(LoadAdError loadAdError) {
            rewardedAd = null;
            rewardedLoading = false;
          }
        });
  }

  private void showRewardedAdFromWeb() {
    Bridge bridge = getBridge();
    if (bridge != null) {
      WebView webView = bridge.getWebView();
      if (webView != null) {
        webView.evaluateJavascript(
            AD_FREE_JS,
            value -> {
              if (isJsTruthy(value)) {
                runOnUiThread(this::dispatchRewardedDismissed);
                return;
              }
              runOnUiThread(this::showRewardedAdFromWebInner);
            });
        return;
      }
    }
    showRewardedAdFromWebInner();
  }

  private void showRewardedAdFromWebInner() {
    if (rewardedAd == null) {
      loadRewardedAd();
      dispatchRewardedDismissed();
      return;
    }
    rewardedAd.show(
        this,
        (OnUserEarnedRewardListener) rewardItem -> dispatchRewardedEarned());
  }

  private void dispatchRewardedEarned() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    webView.evaluateJavascript(
        "window.dispatchEvent(new Event('rr-rewarded-earned'));", null);
  }

  private void dispatchRewardedDismissed() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    webView.evaluateJavascript(
        "window.dispatchEvent(new Event('rr-rewarded-dismissed'));", null);
  }

  private void pushSafeAreaInsetsFromDecor() {
    View decor = getWindow() != null ? getWindow().getDecorView() : null;
    if (decor == null) {
      return;
    }
    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
    if (insets != null) {
      pushSafeAreaInsets(insets);
    }
  }

  private void pushSafeAreaInsets(WindowInsetsCompat insets) {
    int top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
    int bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    String js =
        "document.documentElement.style.setProperty('--rr-safe-area-top','"
            + top
            + "px');document.documentElement.style.setProperty('--rr-safe-area-bottom','"
            + bottom
            + "px');";
    webView.evaluateJavascript(js, null);
  }

  private int webTopInsetBelowAdPx(WebView webView) {
    if (adView == null || webView == null || adView.getVisibility() != View.VISIBLE) {
      return 0;
    }
    int[] adWin = new int[2];
    int[] wvWin = new int[2];
    adView.getLocationInWindow(adWin);
    webView.getLocationInWindow(wvWin);
    int bannerPx = adView.getHeight();
    if (bannerPx <= 0) {
      bannerPx =
          (int) (FALLBACK_BANNER_HEIGHT_DP * getResources().getDisplayMetrics().density + 0.5f);
    }
    int adBottomInWindow = adWin[1] + bannerPx;
    int inset = adBottomInWindow - wvWin[1];
    if (inset < 0) {
      inset = 0;
    }
    int gapPx = (int) (BANNER_TOP_GAP_DP * getResources().getDisplayMetrics().density + 0.5f);
    return inset + gapPx;
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
      if (insetPx > 0) {
        js =
            "document.documentElement.style.setProperty('--rr-native-ad-banner-height','"
                + insetPx
                + "px');";
      } else {
        int statusPx = statusBarInsetPx();
        js =
            statusPx > 0
                ? "document.documentElement.style.setProperty('--rr-native-ad-banner-height','"
                    + statusPx
                    + "px');"
                : "document.documentElement.style.removeProperty('--rr-native-ad-banner-height');";
      }
    } else {
      int statusPx = statusBarInsetPx();
      js =
          statusPx > 0
              ? "document.documentElement.style.setProperty('--rr-native-ad-banner-height','"
                  + statusPx
                  + "px');"
              : "document.documentElement.style.removeProperty('--rr-native-ad-banner-height');";
    }
    webView.evaluateJavascript(js, null);
  }

  private final class WebAdsBridge {
    @JavascriptInterface
    public void sync() {
      runOnUiThread(MainActivity.this::syncAdVisibilityFromWeb);
    }

    @JavascriptInterface
    public void showRewarded() {
      runOnUiThread(MainActivity.this::showRewardedAdFromWeb);
    }
  }
}
