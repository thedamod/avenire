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
    private final Runnable hold = () -> { if (gesture.hold()) openAva("dock"); };

    @Override protected void onServiceConnected() { Log.i("AvenireEssentialKey", "Key listener connected"); }
    @Override protected boolean onKeyEvent(KeyEvent event) {
        if (event.getScanCode() != 250) return false;
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            if (gesture.down(event.getDownTime())) handler.postAtTime(hold, event.getDownTime() + KeyGesture.HOLD_MS);
        } else if (event.getAction() == KeyEvent.ACTION_UP) {
            handler.removeCallbacks(hold);
            String action = gesture.up(event.getEventTime(), event.isCanceled());
            if ("popover".equals(action) && (AvaActivity.visible || opening)) requestCapture();
            else if (action != null) openAva(action);
        }
        return true;
    }
    private void requestCapture() {
        if (opening) { capturePending = true; return; }
        startActivity(new Intent(this, AvaActivity.class).putExtra("mode", "capture")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }
    private void openAva(String mode) {
        if (opening) { pendingMode = mode; return; }
        pendingMode = mode;
        final long id = ++request;
        final String eventId = Long.toString(SystemClock.elapsedRealtimeNanos());
        if (AvaActivity.visible) { launch(AvaActivity.activeEventId, AvaActivity.hasPreview); return; }
        opening = true;
        // Screenshot is acquired before our Activity can cover the original app.
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
        startActivity(new Intent(this, AvaActivity.class).putExtra("eventId", eventId)
            .putExtra("preview", preview).putExtra("fromKey", true)
            .putExtra("mode", pendingMode).putExtra("captureRequested", capturePending)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        capturePending = false;
    }
    private void reset() { handler.removeCallbacks(hold); gesture.reset(); }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {}
    @Override public void onInterrupt() { reset(); request++; opening = false; capturePending = false; }
    @Override public boolean onUnbind(Intent intent) { reset(); request++; opening = false; capturePending = false; return super.onUnbind(intent); }
    @Override public void onDestroy() { reset(); request++; images.shutdown(); super.onDestroy(); }
}
