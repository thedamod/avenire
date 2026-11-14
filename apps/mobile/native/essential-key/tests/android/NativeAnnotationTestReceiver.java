package com.thedamod.avenire.essentialkey;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;

/** Probe-only shell-permission test receiver. Absent from all production builds. */
public final class NativeAnnotationTestReceiver extends BroadcastReceiver {
    private static void check(boolean value, String reason) { if (!value) throw new AssertionError(reason); }
    @Override public void onReceive(Context context, Intent intent) {
        try {
            check(EssentialKeyService.live != null, "Enable Avenire Essential Key before running this test.");
            if (intent.getBooleanExtra("clear", false)) {
                EssentialKeyService.live.clearSession(); setResultData("Native annotation fixture cleared"); return;
            }
            EssentialKeyService service = EssentialKeyService.live;
            service.clearSession();
            Bitmap noisy = Bitmap.createBitmap(600, 1200, Bitmap.Config.ARGB_8888);
            int[] randomPixels = new int[600*1200]; java.util.Random random = new java.util.Random(42);
            for (int i = 0; i < randomPixels.length; i++) randomPixels[i] = 0xFF000000 | (random.nextInt() & 0xFFFFFF);
            noisy.setPixels(randomPixels, 0, 600, 0, 0, 600, 1200);
            File previewFile = new File(service.getCacheDir(), "ava-preview.png");
            try (FileOutputStream out = new FileOutputStream(previewFile)) { noisy.compress(Bitmap.CompressFormat.PNG, 100, out); }
            noisy.recycle();
            check(previewFile.length() > 786_432, "Noisy fixture must exceed wire size limit");
            ScreenSession.begin(service, "size-test", true);
            JSONObject bounded = ScreenSession.observation(service, "size-test");
            check(bounded.getString("data").length() <= 1_048_576, "Request image exceeded shared contract limit");
            check(bounded.getInt("height") < 1200 && Math.abs(bounded.getDouble("width") / bounded.getDouble("height") - 0.5) < 0.002, "Request downscale changed aspect ratio");
            ScreenSession.owner(service, "annotation-owner-a"); ScreenSession.owner(service, "annotation-owner-b");
            check(ScreenSession.id(service).isEmpty() && !previewFile.exists(), "Account change retained screen context");
            Bitmap image = Bitmap.createBitmap(720, 1600, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(image); canvas.drawColor(Color.rgb(15, 15, 15));
            Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG); ink.setColor(Color.WHITE); ink.setTextSize(38);
            canvas.drawText("Native annotation test", 55, 120, ink);
            ink.setColor(Color.rgb(70, 95, 130)); canvas.drawRoundRect(90, 260, 390, 620, 24, 24, ink);
            ink.setColor(Color.WHITE); canvas.drawText("A", 220, 460, ink);
            try (FileOutputStream out = new FileOutputStream(new File(service.getCacheDir(), "ava-preview.png"))) { image.compress(Bitmap.CompressFormat.PNG, 100, out); }
            image.recycle();
            ScreenSession.begin(service, "annotation-test", true);
            String stamp = ScreenSession.capturedAt(service);
            JSONObject observation = ScreenSession.observation(service, "annotation-test");
            check(observation.getInt("width") == 720 && observation.getInt("height") == 1600, "Wrong capture dimensions");
            JSONArray items = new JSONArray("[{\"id\":\"a\",\"kind\":\"cursor\",\"x\":0.35,\"y\":0.28,\"text\":\"This bubble points at region A. It wraps like the desktop annotation tool.\"},{\"id\":\"b\",\"kind\":\"rect\",\"x\":0.12,\"y\":0.16,\"width\":0.43,\"height\":0.23},{\"id\":\"c\",\"kind\":\"arrow\",\"x\":0.2,\"y\":0.6,\"width\":0.32,\"height\":0.15,\"text\":\"Arrows use normalized screenshot coordinates.\"}]");
            JSONObject result = new JSONObject().put("requested", true).put("capturedAt", stamp).put("items", items);
            service.annotate("annotation-test", result);
            check(service.annotationCount() == 3, "Annotations not applied");
            boolean rejected = false;
            try { service.annotate("another-capture", result); } catch (IllegalStateException expected) { rejected = true; }
            check(rejected && service.annotationCount() == 3, "Stale output was applied");
            rejected = false;
            try { ScreenAnnotation.parse(new JSONArray("[{\"id\":\"bad\",\"kind\":\"rect\",\"x\":1.1,\"y\":0.1}]")); } catch (org.json.JSONException expected) { rejected = true; }
            check(rejected, "Out-of-bounds coordinates accepted");
            result.put("items", new JSONArray()); service.annotate("annotation-test", result);
            check(service.annotationCount() == 0, "Empty array did not clear annotations");
            result.put("items", items); service.annotate("annotation-test", result);
            Bitmap pixels = Bitmap.createBitmap(500, 500, Bitmap.Config.ARGB_8888); Canvas pixelCanvas = new Canvas(pixels); pixelCanvas.drawColor(Color.BLACK);
            AnnotationPainter.draw(pixelCanvas, new RectF(100, 100, 400, 400), ScreenAnnotation.parse(new JSONArray("[{\"id\":\"alpha\",\"kind\":\"cursor\",\"x\":0.2,\"y\":0.4,\"color\":\"#FF000080\"}]")), 1, 1, android.graphics.Typeface.DEFAULT, Color.WHITE);
            int red = Color.red(pixels.getPixel(160, 220)); check(red >= 127 && red <= 129, "RGBA color or normalized image mapping failed"); pixels.recycle();

            java.lang.reflect.Field overlayField = EssentialKeyService.class.getDeclaredField("overlay"); overlayField.setAccessible(true);
            AvaOverlay fixtureOverlay = (AvaOverlay) overlayField.get(service);
            fixtureOverlay.beginResponse("Explain region A.");
            service.updateResponse("annotation-test", "Region A is highlighted. Follow-up questions stay in this scrolling thread.", true, "test-thread");
            java.lang.reflect.Field turnsField = AvaOverlay.class.getDeclaredField("turns"); turnsField.setAccessible(true);
            check(((android.widget.LinearLayout)turnsField.get(fixtureOverlay)).getChildCount() == 1, "Dock should retain only the current reply");
            if (intent.getBooleanExtra("back", false)) {
                PendingResult pending = goAsync();
                android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
                main.postDelayed(() -> {
                    try {
                        java.lang.reflect.Field field = EssentialKeyService.class.getDeclaredField("overlay"); field.setAccessible(true);
                        AvaOverlay overlay = (AvaOverlay) field.get(service);
                        java.lang.reflect.Field rootField = AvaOverlay.class.getDeclaredField("root"); rootField.setAccessible(true);
                        android.view.View root = (android.view.View) rootField.get(overlay);
                        root.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_BACK));
                        root.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_BACK));
                        if (!android.animation.ValueAnimator.areAnimatorsEnabled()) {
                            check(field.get(service) == null, "Reduced motion did not close immediately");
                            pending.setResultCode(-1); pending.setResultData("Native annotation and reduced-motion Back tests passed."); pending.finish(); return;
                        }
                        check(overlay.isClosing(), "Back bypassed the close animation");
                        main.postDelayed(() -> {
                            try {
                                java.lang.reflect.Field previewField = AvaOverlay.class.getDeclaredField("preview"); previewField.setAccessible(true);
                                ScreenPreview preview = (ScreenPreview) previewField.get(overlay);
                                check(field.get(service) == overlay && preview.getScaleX() > 1, "Back did not expand the screenshot before removing it");
                                main.postDelayed(() -> {
                                    try {
                                        check(field.get(service) == null, "Back did not remove the overlay after animation");
                                        check(ScreenSession.id(service).isEmpty(), "Back retained the dismissed capture");
                                        pending.setResultCode(-1); pending.setResultData("Native annotation tests and Back animation passed: expanded screenshot before removal, then invalidated capture.");
                                    } catch (Throwable e) { pending.setResultCode(0); pending.setResultData("Back test failed: " + e); }
                                    finally { pending.finish(); }
                                }, 220);
                            } catch (Throwable e) { pending.setResultCode(0); pending.setResultData("Back test failed: " + e); pending.finish(); }
                        }, 80);
                    } catch (Throwable e) { pending.setResultCode(0); pending.setResultData("Back test failed: " + e); pending.finish(); }
                }, 350);
            } else {
                setResultCode(-1);
                setResultData("Native annotation tests passed: render, clear, stale capture, bounds, RGBA and image coordinates.");
            }
        } catch (Throwable error) {
            setResultCode(0); setResultData("Native annotation tests failed: " + error);
            android.util.Log.e("AvenireAnnotationTest", "Native fixture failed", error);
        }
    }
}
