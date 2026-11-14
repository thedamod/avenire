package com.thedamod.avenire.essentialkey;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

/** Assistant/OEM shortcut target. No content window, task switch, or screenshot of an entry screen. */
public final class AvaEntryActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (getSystemService(KeyguardManager.class).isKeyguardLocked()) { finish(); return; }
        EssentialKeyService service = EssentialKeyService.live;
        if (service == null) {
            Toast.makeText(this, "Enable Avenire Ava in Accessibility, then use your shortcut again.", Toast.LENGTH_LONG).show();
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        } else {
            boolean widget = "com.thedamod.avenire.AVA_WIDGET".equals(getIntent().getAction());
            // A home widget opens text-only Ava; the launcher is not study context.
            service.trigger(widget ? "dock" : "toggle", !widget);
        }
        finish();
    }
}
