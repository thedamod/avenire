package com.thedamod.avenire.essentialkey;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.ComponentName;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

/** Assistant/OEM shortcut target. No content window, task switch, or screenshot of an entry screen. */
public final class AvaEntryActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (getSystemService(KeyguardManager.class).isKeyguardLocked()) { finish(); return; }
        EssentialKeyService service = EssentialKeyService.live;
        boolean widget = "com.thedamod.avenire.AVA_WIDGET".equals(getIntent().getAction());
        AvaEntryRoute.Target target = AvaEntryRoute.choose(widget, service != null, serviceEnabled());
        if (target == AvaEntryRoute.Target.OVERLAY) {
            // A home widget opens text-only Ava; the launcher is not study context.
            service.trigger(widget ? "dock" : "toggle", !widget);
        } else if (target == AvaEntryRoute.Target.APP) {
            // Widgets need no screen permission. Enabled services may also be reconnecting.
            Intent ask = new Intent(Intent.ACTION_VIEW, Uri.parse("avenire://ask"))
                .setPackage(getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
            if (ask.resolveActivity(getPackageManager()) != null) startActivity(ask);
            else Toast.makeText(this, "Install the integrated Avenire app to ask Ava. This is the diagnostic preview.", Toast.LENGTH_LONG).show();
        } else {
            Toast.makeText(this, "Enable Avenire Ava in Accessibility, then use your shortcut again.", Toast.LENGTH_LONG).show();
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        }
        finish();
    }
    private boolean serviceEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName own = new ComponentName(this, EssentialKeyService.class);
        for (String entry : enabled.split(":")) if (own.equals(ComponentName.unflattenFromString(entry))) return true;
        return false;
    }
}
