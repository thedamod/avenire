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
    private final ExecutorService transfers = Executors.newFixedThreadPool(2);
    private final Handler main = new Handler(Looper.getMainLooper());
    AvenireScreenModule(ReactApplicationContext context) { super(context); }
    @Override public String getName() { return "AvenireScreen"; }
    @ReactMethod public void captureWork(String owner,Promise promise) {
        io.execute(() -> { try { org.json.JSONObject row=CaptureStore.claim(getReactApplicationContext(),owner); promise.resolve(row==null?null:row.toString()); } catch(Exception e) { promise.reject("CAPTURE_QUEUE",e.getMessage(),e); } });
    }
    @ReactMethod public void captureRead(String id,String owner,Promise promise) {
        io.execute(() -> { try { promise.resolve(CaptureStore.get(getReactApplicationContext(),id,owner).toString()); } catch(Exception e) { promise.reject("CAPTURE_QUEUE",e.getMessage(),e); } });
    }
    @ReactMethod public void captureUpdate(String id,String owner,String json,Promise promise) {
        io.execute(() -> { try { org.json.JSONObject row=CaptureStore.update(getReactApplicationContext(),id,owner,new org.json.JSONObject(json)); EssentialKeyService service=EssentialKeyService.live; if(service!=null) service.showCaptureReceipt(row); promise.resolve(null); } catch(Exception e) { promise.reject("CAPTURE_QUEUE",e.getMessage(),e); } });
    }
    @ReactMethod public void captureSend(String id,String owner,String url,String method,String headers,String fields,String origin,Promise promise) {
        transfers.execute(() -> { try { promise.resolve(CaptureTransfer.send(getReactApplicationContext(),id,owner,url,method,new org.json.JSONObject(headers),new org.json.JSONObject(fields),origin).toString()); } catch(Exception e) { promise.reject("CAPTURE_TRANSFER",e.getMessage(),e); } });
    }
    @ReactMethod public void captureCancelTransfer(String id,Promise promise) { CaptureTransfer.cancel(id); promise.resolve(null); }
    @ReactMethod public void captureDefer(Promise promise) { io.execute(() -> { try { CaptureStore.defer(getReactApplicationContext()); promise.resolve(null); } catch(Exception error) { promise.reject("CAPTURE_QUEUE",error.getMessage(),error); } }); }
    @ReactMethod public void captureFinished(Promise promise) { main.post(() -> { if(!CaptureJobService.complete()) CaptureJobs.schedule(getReactApplicationContext()); promise.resolve(null); }); }
    @ReactMethod public void getTriggerStatus(Promise promise) {
        main.post(() -> {
            android.app.role.RoleManager roles = getReactApplicationContext().getSystemService(android.app.role.RoleManager.class);
            WritableMap status = Arguments.createMap();
            status.putBoolean("enabled", EssentialKeyService.live != null);
            status.putBoolean("nothing", EssentialKeyService.isNothing());
            status.putBoolean("essentialKey", EssentialKeyService.keyEnabled(getReactApplicationContext()));
            status.putBoolean("assistantAvailable", roles.isRoleAvailable(android.app.role.RoleManager.ROLE_ASSISTANT));
            status.putBoolean("assistant", roles.isRoleHeld(android.app.role.RoleManager.ROLE_ASSISTANT));
            status.putBoolean("widget", android.appwidget.AppWidgetManager.getInstance(getReactApplicationContext()).isRequestPinAppWidgetSupported());
            promise.resolve(status);
        });
    }
    @ReactMethod public void setEssentialKey(boolean enabled, Promise promise) {
        getReactApplicationContext().getSharedPreferences("ava-triggers", 0).edit().putBoolean("essentialKey", enabled).apply();
        promise.resolve(null);
    }
    @ReactMethod public void configureTrigger(String trigger, Promise promise) {
        main.post(() -> {
            try {
                android.app.Activity activity = getReactApplicationContext().getCurrentActivity();
                if (activity == null) throw new IllegalStateException("Open Avenire to configure shortcuts.");
                if ("widget".equals(trigger)) {
                    android.appwidget.AppWidgetManager widgets = android.appwidget.AppWidgetManager.getInstance(activity);
                    if (!widgets.isRequestPinAppWidgetSupported()) throw new IllegalStateException("Add the Ava widget from your launcher's widget picker.");
                    if (!widgets.requestPinAppWidget(new android.content.ComponentName(activity, AvaWidget.class), null, null)) throw new IllegalStateException("Your launcher could not add the Ava widget.");
                } else if ("assistant".equals(trigger)) {
                    android.app.role.RoleManager roles = activity.getSystemService(android.app.role.RoleManager.class);
                    if (!roles.isRoleAvailable(android.app.role.RoleManager.ROLE_ASSISTANT)) throw new IllegalStateException("This phone does not offer a default assistant setting.");
                    activity.startActivityForResult(roles.createRequestRoleIntent(android.app.role.RoleManager.ROLE_ASSISTANT), 7411);
                } else if ("accessibility".equals(trigger)) {
                    activity.startActivity(new android.content.Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS));
                } else if ("gestures".equals(trigger)) {
                    activity.startActivity(new android.content.Intent(android.provider.Settings.ACTION_SETTINGS));
                } else throw new IllegalArgumentException("Unknown shortcut setting.");
                promise.resolve(null);
            } catch (Exception error) { promise.reject("SHORTCUT_UNAVAILABLE", error.getMessage(), error); }
        });
    }
    @ReactMethod public void canShareScreen(String session, Promise promise) {
        main.post(() -> promise.resolve(EssentialKeyService.live != null && EssentialKeyService.live.screenAllowed(session)));
    }
    @ReactMethod public void bindOwner(String owner, Promise promise) {
        main.post(() -> {
            String before = getReactApplicationContext().getSharedPreferences("ava-screen-session", 0).getString("owner", null);
            if (before != null && !before.equals(owner) && EssentialKeyService.live != null) { EssentialKeyService.live.clearSession(); EssentialKeyService.live.clearCaptureReceipt(); }
            ScreenSession.owner(getReactApplicationContext(), owner); CaptureJobs.schedule(getReactApplicationContext()); promise.resolve(null);
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
                if (EssentialKeyService.live == null) throw new IllegalStateException("Enable Avenire Ava in Accessibility.");
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
    @Override public void invalidate() { io.shutdownNow(); transfers.shutdownNow(); super.invalidate(); }
}
