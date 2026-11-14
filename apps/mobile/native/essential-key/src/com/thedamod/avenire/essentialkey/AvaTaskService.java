package com.thedamod.avenire.essentialkey;

import android.content.Intent;
import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;

/** Runs the authenticated chat stream without launching or navigating an Activity. */
public final class AvaTaskService extends HeadlessJsTaskService {
    @Override protected HeadlessJsTaskConfig getTaskConfig(Intent intent) {
        if (intent == null || intent.getExtras() == null) return null;
        return new HeadlessJsTaskConfig(intent.getBooleanExtra("capture", false) ? "AvenireCapture" : "AvenireAva", Arguments.fromBundle(intent.getExtras()), 240000, true);
    }
    // Do not redeliver an uncertain send after Android kills this service.
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId); return START_NOT_STICKY;
    }
}
