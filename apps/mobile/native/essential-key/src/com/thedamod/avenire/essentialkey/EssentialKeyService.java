package com.thedamod.avenire.essentialkey;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.graphics.Bitmap;
import android.hardware.HardwareBuffer;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.Display;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** One click opens a popover, another requests capture, and hold opens the Ava text dock. */
public final class EssentialKeyService extends AccessibilityService {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final KeyGesture gesture = new KeyGesture();
    private final ExecutorService images = Executors.newSingleThreadExecutor();
    private volatile long request;
    private boolean opening;
    private boolean capturePending;
    private String pendingMode;
    private AvaOverlay overlay;
    private final OverlayContext screen = new OverlayContext();
    static volatile EssentialKeyService live;
    private final Runnable hold = () -> { if (gesture.hold()) openAva("dock"); };

    @Override protected void onServiceConnected() { live = this; Log.i("AvenireEssentialKey", "Key listener connected"); }
    @Override protected boolean onKeyEvent(KeyEvent event) {
        if (event.getScanCode() != 250) return false;
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            if (gesture.down(event.getDownTime())) handler.postAtTime(hold, event.getDownTime() + KeyGesture.HOLD_MS);
        } else if (event.getAction() == KeyEvent.ACTION_UP) {
            handler.removeCallbacks(hold);
            String action = gesture.up(event.getEventTime(), event.isCanceled());
            if ("popover".equals(action) && (overlay != null || opening)) requestCapture();
            else if (action != null) openAva(action);
        }
        return true;
    }
    private void requestCapture() {
        if (opening) { capturePending = true; return; }
        if (overlay != null) overlay.requestCapture();
    }
    private void openAva(String mode) {
        if (opening) { pendingMode = mode; return; }
        pendingMode = mode;
        final long id = ++request;
        final String eventId = Long.toString(SystemClock.elapsedRealtimeNanos());
        if (overlay != null) { overlay.updateMode(mode); return; }
        ScreenSession.clear(this);
        screen.open();
        opening = true;
        // Screenshot is acquired before adding our overlay window over the original app.
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                @Override public void onSuccess(ScreenshotResult result) {
                    HardwareBuffer buffer = result.getHardwareBuffer();
                    if (id != request) { buffer.close(); return; }
                    images.execute(() -> {
                        Bitmap hardware = null;
                        Bitmap copy = null;
                        Bitmap scaled = null;
                        boolean ready = false;
                        try {
                            hardware = Bitmap.wrapHardwareBuffer(buffer, result.getColorSpace());
                            if (hardware == null) throw new IOException("No preview bitmap");
                            copy = hardware.copy(Bitmap.Config.ARGB_8888, false);
                            if (copy == null) throw new IOException("No preview copy");
                            float factor = Math.min(1f, 1600f / Math.max(copy.getWidth(), copy.getHeight()));
                            scaled = Bitmap.createScaledBitmap(copy, Math.max(1, Math.round(copy.getWidth()*factor)), Math.max(1, Math.round(copy.getHeight()*factor)), true);
                            try (FileOutputStream output = new FileOutputStream(new File(getCacheDir(), "ava-preview.png"))) {
                                ready = scaled.compress(Bitmap.CompressFormat.PNG, 100, output);
                            }
                        } catch (IOException | RuntimeException error) {
                            Log.w("AvenireEssentialKey", "Screen preview unavailable", error);
                        } finally {
                            if (scaled != null && scaled != copy) scaled.recycle();
                            if (copy != null) copy.recycle();
                            if (hardware != null) hardware.recycle();
                            buffer.close();
                        }
                        final boolean available = ready;
                        handler.post(() -> { if (id == request) launch(eventId, available); });
                    });
                }
                @Override public void onFailure(int code) {
                    Log.i("AvenireEssentialKey", "Preview unavailable code=" + code);
                    if (id == request) launch(eventId, false);
                }
            });
        } catch (SecurityException unavailable) { launch(eventId, false); }
    }
    private void launch(String eventId, boolean preview) {
        opening = false;
        Log.i("AvenireEssentialKey", "Ava opened mode=" + pendingMode + " preview=" + preview + " eventId=" + eventId);
        ScreenSession.begin(this, eventId, preview);
        overlay = new AvaOverlay(this, eventId, pendingMode, preview, (keep) -> { overlay = null; screen.close(); if (!keep) ScreenSession.clear(this); });
        overlay.show();
        if (capturePending) overlay.requestCapture();
        capturePending = false;
    }
    void submit(String session, String question) throws Exception {
        Class<?> task;
        try { task = Class.forName("com.thedamod.avenire.essentialkey.AvaTaskService"); }
        catch (ClassNotFoundException missing) { throw new IllegalStateException("Install the integrated Avenire build to send. Your prompt stays here."); }
        startService(new Intent(this, task).putExtra("session", session).putExtra("question", question)
            .putExtra("threadId", getSharedPreferences("ava-screen-session", 0).getString("threadId", "")));
    }
    void updateResponse(String session, String text, boolean done, String threadId) {
        if (!session.equals(ScreenSession.id(this)) || overlay == null || overlay.isClosing()) return;
        if (!threadId.isEmpty()) getSharedPreferences("ava-screen-session", 0).edit().putString("threadId", threadId).apply();
        overlay.updateResponse(text, done);
    }
    int annotationCount() { return overlay == null ? 0 : overlay.annotationCount(); }
    void annotate(String session, org.json.JSONObject result) throws Exception {
        if (!ScreenSession.matches(this, session, result.getString("capturedAt"))) throw new IllegalStateException("Screen context changed or expired.");
        if (overlay != null && overlay.isClosing()) throw new IllegalStateException("Screen explanation is closing.");
        java.util.List<ScreenAnnotation> items = ScreenAnnotation.parse(result.getJSONArray("items"));
        if (overlay == null && items.isEmpty()) return;
        if (overlay == null) {
            screen.open();
            overlay = new AvaOverlay(this, session, "dock", true, (keep) -> { overlay = null; screen.close(); if (!keep) ScreenSession.clear(this); });
            overlay.show();
        }
        overlay.setAnnotations(items);
    }
    void clearSession() { screen.close(); ScreenSession.clear(this); dismissOverlay(); }
    private void dismissOverlay() { if (overlay != null) overlay.dispose(); }
    private void reset() { handler.removeCallbacks(hold); gesture.reset(); }
    // Window metadata only: no accessibility node/content retrieval is enabled.
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (overlay == null && !opening) return;
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.getPackageName() == null) return;
        String name = event.getPackageName().toString();
        boolean keyboard = false;
        android.view.inputmethod.InputMethodManager ime = getSystemService(android.view.inputmethod.InputMethodManager.class);
        for (android.view.inputmethod.InputMethodInfo input : ime.getEnabledInputMethodList()) {
            if (name.equals(input.getPackageName())) { keyboard = true; break; }
        }
        boolean ownOverlay = name.equals(getPackageName())
            && !"com.thedamod.avenire.MainActivity".contentEquals(event.getClassName() == null ? "" : event.getClassName());
        if (screen.windowChanged(name, ownOverlay, keyboard)) leaveScreen();
    }
    void leaveScreen() {
        // Invalidate capture callbacks and running headless work before removing the window.
        request++; opening = false; capturePending = false; reset(); screen.close();
        clearSession();
    }
    @Override public void onInterrupt() { dismissOverlay(); reset(); request++; opening = false; capturePending = false; }
    @Override public boolean onUnbind(Intent intent) { live = null; clearSession(); reset(); request++; opening = false; capturePending = false; return super.onUnbind(intent); }
    @Override public void onDestroy() { live = null; clearSession(); reset(); request++; images.shutdown(); super.onDestroy(); }
}
