package com.thedamod.avenire.essentialkey;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** App-private bridge. The server never connects to the device or receives a native command URL. */
public final class AvenireScreenModule extends ReactContextBaseJavaModule {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    AvenireScreenModule(ReactApplicationContext context) { super(context); }
    @Override public String getName() { return "AvenireScreen"; }
    @ReactMethod public void bindOwner(String owner, Promise promise) {
        main.post(() -> {
            String before = getReactApplicationContext().getSharedPreferences("ava-screen-session", 0).getString("owner", null);
            if (before != null && !before.equals(owner) && EssentialKeyService.live != null) EssentialKeyService.live.clearSession();
            ScreenSession.owner(getReactApplicationContext(), owner); promise.resolve(null);
        });
    }
    @ReactMethod public void clearSession(Promise promise) {
        main.post(() -> {
            if (EssentialKeyService.live != null) EssentialKeyService.live.clearSession();
            else ScreenSession.clear(getReactApplicationContext());
            promise.resolve(null);
        });
    }
    @ReactMethod public void getScreenContext(String session, Promise promise) {
        io.execute(() -> {
            try {
                if (EssentialKeyService.live == null) throw new IllegalStateException("Enable Avenire Essential Key in Accessibility.");
                JSONObject value = ScreenSession.observation(getReactApplicationContext(), session);
                WritableMap map = Arguments.createMap();
                for (String key : new String[]{"mimeType", "data", "screenId", "capturedAt"}) map.putString(key, value.getString(key));
                map.putInt("width", value.getInt("width")); map.putInt("height", value.getInt("height"));
                promise.resolve(map);
            } catch (Exception error) { promise.reject("SCREEN_UNAVAILABLE", error.getMessage(), error); }
        });
    }
    @ReactMethod public void presentAnnotations(String session, String json, Promise promise) {
        if (json.length() > 65536) { promise.reject("ANNOTATION_INVALID", "Annotation result is too large."); return; }
        main.post(() -> {
            try {
                JSONObject value = new JSONObject(json);
                if (!Boolean.TRUE.equals(value.opt("requested"))) throw new IllegalArgumentException("Invalid annotation result.");
                EssentialKeyService service = EssentialKeyService.live;
                if (service == null) throw new IllegalStateException("Screen annotation service is unavailable.");
                service.annotate(session, value);
                promise.resolve(null);
            } catch (Exception error) { promise.reject("ANNOTATION_UNAVAILABLE", error.getMessage(), error); }
        });
    }
    @ReactMethod public void isSessionActive(String session, Promise promise) {
        main.post(() -> promise.resolve(EssentialKeyService.live != null && session.equals(ScreenSession.id(getReactApplicationContext()))));
    }
    @ReactMethod public void updateResponse(String session, String text, boolean done, String threadId, Promise promise) {
        main.post(() -> {
            EssentialKeyService service = EssentialKeyService.live;
            if (service != null) service.updateResponse(session, text, done, threadId);
            promise.resolve(null);
        });
    }
    @Override public void invalidate() { io.shutdownNow(); super.invalidate(); }
}
