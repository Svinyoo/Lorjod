package com.parkly.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private final ServerPolicy.Role role = ServerPolicy.Role.from(BuildConfig.ROLE);
    private volatile URI origin;
    private WebView web;
    private FrameLayout container;
    private ProgressBar progress;
    private View errorPanel;
    private TextView errorMessage;
    private Button back;
    private SharedPreferences preferences;
    private String mobileCSS = "";
    private boolean busy;
    private boolean failed;
    private final java.util.Set<WebView> popups = new java.util.HashSet<>();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        preferences = getSharedPreferences("connection", MODE_PRIVATE);
        container = findViewById(R.id.web_container);
        progress = findViewById(R.id.progress);
        errorPanel = findViewById(R.id.error_panel);
        errorMessage = findViewById(R.id.error_message);
        back = findViewById(R.id.back);
        ((TextView) findViewById(R.id.title)).setText(getString(R.string.app_name) + " · " + role.title);
        back.setOnClickListener(view -> goBack());
        findViewById(R.id.home).setOnClickListener(view -> home());
        findViewById(R.id.retry).setOnClickListener(view -> home());
        findViewById(R.id.settings).setOnClickListener(view -> settings());
        findViewById(R.id.error_settings).setOnClickListener(view -> settings());
        installInsets();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        try (InputStream stream = getAssets().open("mobile.css")) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int length;
            while ((length = stream.read(buffer)) != -1) bytes.write(buffer, 0, length);
            mobileCSS = bytes.toString(StandardCharsets.UTF_8.name());
        } catch (IOException ignored) { /* The web UI remains usable without optional styling. */ }
        String configured = BuildConfig.DEBUG ? preferences.getString("server", BuildConfig.SERVER_URL) : BuildConfig.SERVER_URL;
        try { origin = ServerPolicy.origin(configured, BuildConfig.DEBUG); }
        catch (IllegalArgumentException ignored) { origin = null; }
        createWebView();
        home();
    }

    private void installInsets() {
        View root = findViewById(R.id.root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
                return WindowInsets.CONSUMED;
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web = new WebView(this);
        web.setSaveEnabled(false);
        WebSettings config = web.getSettings();
        // Required by our existing HTML application; no JavaScript/native bridge is exposed.
        config.setJavaScriptEnabled(true);
        config.setDomStorageEnabled(true);
        config.setAllowFileAccess(false);
        config.setAllowContentAccess(false);
        config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        config.setJavaScriptCanOpenWindowsAutomatically(false);
        config.setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        container.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void home() {
        if (busy) return;
        if (origin == null) { showError(getString(R.string.not_configured)); return; }
        if (web == null) createWebView();
        failed = false;
        errorPanel.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        // GET only: never automatically replay a failed booking or form POST.
        web.loadUrl(origin.resolve(role.homePath()).toString());
    }

    private void goBack() {
        if (busy) return;
        if (web != null && web.canGoBack()) {
            failed = false;
            errorPanel.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
            web.goBack();
        } else { finish(); }
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { goBack(); }

    private void showError(String message) {
        failed = true;
        progress.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
        if (web != null) web.setVisibility(View.INVISIBLE);
        findViewById(R.id.retry).setEnabled(origin != null && !busy);
        back.setEnabled(web != null && web.canGoBack());
    }

    private void notifyUser(int message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }

    private void settings() {
        if (busy) return;
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        fields.setPadding(padding, padding / 2, padding, padding / 2);
        TextView roleLabel = new TextView(this);
        roleLabel.setText(getString(R.string.app_name) + " · " + role.title);
        fields.addView(roleLabel);
        TextView help = new TextView(this);
        help.setText(BuildConfig.DEBUG ? R.string.connection_help : R.string.release_help);
        fields.addView(help);
        EditText url = new EditText(this);
        url.setSingleLine(true);
        url.setHint(R.string.server_url);
        url.setContentDescription(getString(R.string.server_url));
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(origin == null ? "" : origin.toString());
        url.setEnabled(BuildConfig.DEBUG);
        fields.addView(url);
        Button reset = new Button(this);
        reset.setText(R.string.clear_session);
        fields.addView(reset);
        TextView note = new TextView(this);
        note.setText(R.string.prototype);
        fields.addView(note);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(fields);
        AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle(R.string.settings).setView(scroll)
            .setNegativeButton(R.string.close, null);
        if (BuildConfig.DEBUG) builder.setPositiveButton(R.string.save_connect, null);
        AlertDialog dialog = builder.create();
        reset.setOnClickListener(view -> new AlertDialog.Builder(this).setTitle(R.string.clear_session)
            .setMessage(R.string.clear_description).setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.ok, (confirm, which) -> { dialog.dismiss(); resetWebData(origin, false); }).show());
        dialog.setOnShowListener(unused -> {
            if (BuildConfig.DEBUG) dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                try {
                    URI next = ServerPolicy.origin(url.getText().toString(), true);
                    dialog.dismiss();
                    resetWebData(next, true);
                } catch (IllegalArgumentException error) { url.setError(error.getMessage()); }
            });
        });
        dialog.show();
    }

    private void resetWebData(URI next, boolean save) {
        busy = true;
        if (web != null) { web.clearCache(true); destroyWebView(); }
        WebStorage.getInstance().deleteAllData();
        showError("กำลังล้างข้อมูลการเชื่อมต่อ…");
        CookieManager.getInstance().removeAllCookies(removed -> {
            CookieManager.getInstance().flush();
            if (save && BuildConfig.DEBUG) preferences.edit().putString("server", next.toString()).apply();
            if (isDestroyed() || isFinishing()) return;
            origin = next;
            busy = false;
            createWebView();
            home();
        });
    }

    private void destroyWebView() {
        if (web == null) return;
        web.stopLoading();
        web.setWebChromeClient(null);
        web.setWebViewClient(new WebViewClient());
        container.removeView(web);
        web.destroy();
        web = null;
    }

    /** Returns true when native code consumes/blocks a navigation. */
    private boolean navigate(String value, boolean gesture) {
        try {
            URI target = new URI(value);
            if (ServerPolicy.sameOrigin(target, origin)) {
                if (role.permitsPage(target)) return false;
                notifyUser(R.string.role_blocked);
            } else if (gesture && ServerPolicy.permitsExternal(target)) {
                try {
                    String action = "tel".equalsIgnoreCase(target.getScheme()) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW;
                    startActivity(new Intent(action, Uri.parse(value)).addCategory(Intent.CATEGORY_BROWSABLE));
                } catch (ActivityNotFoundException | SecurityException ignored) { notifyUser(R.string.no_handler); }
            } else { notifyUser(R.string.redirect_blocked); }
        } catch (Exception ignored) { notifyUser(R.string.redirect_blocked); }
        return true;
    }

    private final class Client extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Frames cannot open another site or invoke other apps.
            if (!request.isForMainFrame()) return true;
            return navigate(request.getUrl().toString(), request.hasGesture());
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            try {
                URI target = new URI(request.getUrl().toString());
                if (ServerPolicy.sameOrigin(target, origin)) return null;
            } catch (Exception ignored) { /* Block unsupported resource URLs. */ }
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }

        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            // Also inspect redirects and navigations initiated without shouldOverrideUrlLoading.
            try {
                URI target = new URI(url);
                if (!ServerPolicy.sameOrigin(target, origin) || !role.permitsPage(target)) {
                    view.stopLoading();
                    showError(getString(R.string.role_blocked));
                    return;
                }
            } catch (Exception ignored) { view.stopLoading(); showError(getString(R.string.network_error)); return; }
            failed = false;
            errorPanel.setVisibility(View.GONE);
            view.setVisibility(View.VISIBLE);
            progress.setVisibility(View.VISIBLE);
        }

        @Override public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            back.setEnabled(view.canGoBack());
            CookieManager.getInstance().flush();
            if (failed) return;
            try {
                URI target = new URI(url);
                if (!ServerPolicy.sameOrigin(target, origin) || !role.permitsPage(target)) return;
                String js = "(() => { if (!document.getElementById('parkly-mobile-style')) { const s=document.createElement('style');"
                    + "s.id='parkly-mobile-style';s.textContent=" + JSONObject.quote(mobileCSS) + ";document.head.appendChild(s); }"
                    + "document.documentElement.dataset.parklyApp=" + JSONObject.quote(role.value) + "; })();";
                view.evaluateJavascript(js, null);
            } catch (Exception ignored) { /* No script is injected into an unknown origin. */ }
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError(getString(R.string.network_error));
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) showError("เซิร์ฟเวอร์ตอบกลับ HTTP " + response.getStatusCode() + " โปรดตรวจ URL และสถานะเซิร์ฟเวอร์");
        }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            showError(getString(R.string.tls_error));
        }
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            destroyWebView();
            showError("หน้าแอพหยุดทำงาน กรุณาเปิดหน้าแรกใหม่ และตรวจรายการก่อนส่งซ้ำ");
            return true;
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override public void onProgressChanged(WebView view, int percent) {
            progress.setProgress(percent);
            if (percent == 100 || failed) progress.setVisibility(View.GONE);
        }
        @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            if (!isUserGesture) return false;
            WebView popup = new WebView(MainActivity.this);
            popup.getSettings().setAllowFileAccess(false);
            popup.getSettings().setAllowContentAccess(false);
            popup.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            popups.add(popup);
            popup.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                    if (!navigate(request.getUrl().toString(), true) && web != null) web.loadUrl(request.getUrl().toString());
                    popups.remove(v);
                    v.post(v::destroy);
                    return true;
                }
                @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                    // A popup is only a transport for a deliberate link; it never loads content.
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
            });
            ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }
        @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setTitle(R.string.app_name).setMessage(message)
                .setPositiveButton(R.string.ok, (dialog, which) -> result.confirm())
                .setOnCancelListener(dialog -> result.cancel()).show();
            return true;
        }
        @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setTitle(R.string.app_name).setMessage(message)
                .setPositiveButton(R.string.ok, (dialog, which) -> result.confirm())
                .setNegativeButton(R.string.cancel, (dialog, which) -> result.cancel())
                .setOnCancelListener(dialog -> result.cancel()).show();
            return true;
        }
        @Override public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
            EditText input = new EditText(MainActivity.this);
            input.setText(defaultValue);
            new AlertDialog.Builder(MainActivity.this).setTitle(R.string.app_name).setMessage(message).setView(input)
                .setPositiveButton(R.string.ok, (dialog, which) -> result.confirm(input.getText().toString()))
                .setNegativeButton(R.string.cancel, (dialog, which) -> result.cancel())
                .setOnCancelListener(dialog -> result.cancel()).show();
            return true;
        }
    }

    @Override protected void onPause() {
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }
    @Override protected void onDestroy() {
        for (WebView popup : popups) popup.destroy();
        popups.clear();
        destroyWebView();
        super.onDestroy();
    }
}
