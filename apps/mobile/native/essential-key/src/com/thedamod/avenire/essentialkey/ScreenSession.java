package com.thedamod.avenire.essentialkey;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.util.Base64;
import org.json.JSONObject;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.time.Instant;

/** A bounded, request-only capture. The opaque ID crosses the deep link, never the pixels. */
final class ScreenSession {
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("ava-screen-session", Context.MODE_PRIVATE); }
    static void begin(Context c, String id, boolean available) {
        prefs(c).edit().remove("threadId").putString("id", id).putString("capturedAt", Instant.now().toString())
            .putLong("created", SystemClock.elapsedRealtime()).putBoolean("available", available).apply();
    }
    static String id(Context c) { return prefs(c).getString("id", ""); }
    static String capturedAt(Context c) { return prefs(c).getString("capturedAt", ""); }
    static boolean matches(Context c, String id, String capturedAt) {
        long age = SystemClock.elapsedRealtime() - prefs(c).getLong("created", -1);
        return id != null && id.equals(id(c)) && capturedAt != null && capturedAt.equals(capturedAt(c))
            && prefs(c).getBoolean("available", false) && age >= 0 && age <= 300_000;
    }
    static JSONObject observation(Context c, String expected) throws Exception {
        if (!matches(c, expected, capturedAt(c))) throw new IllegalStateException("Screen context expired. Open Ava again.");
        File file = new File(c.getCacheDir(), "ava-preview.png");
        // Shared contract caps base64 at 1 MiB. Never return an unbounded image to JS.
        if (!file.isFile() || file.length() > 12_000_000) throw new IllegalStateException("Screen preview is unavailable.");
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), bounds);
        if (bounds.outWidth < 1 || bounds.outHeight < 1 || bounds.outWidth > 1600 || bounds.outHeight > 1600) throw new IllegalStateException("Screen preview is unavailable.");
        int width = bounds.outWidth, height = bounds.outHeight;
        byte[] data;
        if (file.length() <= 786_432) data = Files.readAllBytes(file.toPath());
        else {
            // Keep the local preview sharp; bound only the request image, preserving its aspect ratio.
            Bitmap image = BitmapFactory.decodeFile(file.getPath());
            if (image == null) throw new IllegalStateException("Screen preview is unavailable.");
            try {
                while (true) {
                    ByteArrayOutputStream encoded = new ByteArrayOutputStream();
                    if (!image.compress(Bitmap.CompressFormat.PNG, 100, encoded)) throw new IllegalStateException("Screen encoding failed.");
                    data = encoded.toByteArray();
                    if (data.length <= 786_432) { width = image.getWidth(); height = image.getHeight(); break; }
                    Bitmap smaller = Bitmap.createScaledBitmap(image, Math.max(1, Math.round(image.getWidth()*0.75f)), Math.max(1, Math.round(image.getHeight()*0.75f)), true);
                    image.recycle(); image = smaller;
                }
            } finally { image.recycle(); }
        }
        if (!matches(c, expected, capturedAt(c))) throw new IllegalStateException("Screen context changed.");
        return new JSONObject().put("mimeType", "image/png").put("data", Base64.encodeToString(data, Base64.NO_WRAP))
            .put("width", width).put("height", height).put("screenId", "mobile:" + expected)
            .put("capturedAt", capturedAt(c));
    }
    static void owner(Context c, String owner) {
        String before = prefs(c).getString("owner", null);
        if (before != null && !before.equals(owner)) clear(c);
        prefs(c).edit().putString("owner", owner).apply();
    }
    static void clear(Context c) {
        prefs(c).edit().remove("id").remove("capturedAt").remove("created").putBoolean("available", false).apply();
        new File(c.getCacheDir(), "ava-preview.png").delete();
    }
}
