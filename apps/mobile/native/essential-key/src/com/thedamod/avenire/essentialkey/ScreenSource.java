package com.thedamod.avenire.essentialkey;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.List;

/** Reads package/window metadata only. Never walks text, URLs, form fields or view trees. */
final class ScreenSource {
    final String packageName;
    final int windowId;
    private ScreenSource(String name, int id) { packageName = name; windowId = id; }
    static ScreenSource current(AccessibilityService service) {
        if (service.getSystemService(KeyguardManager.class).isKeyguardLocked()) return null;
        List<AccessibilityWindowInfo> windows = service.getWindows();
        int count = 0;
        AccessibilityWindowInfo target = null;
        for (AccessibilityWindowInfo window : windows) {
            if (window.getType() == AccessibilityWindowInfo.TYPE_APPLICATION) {
                count++;
                target = window; // Exactly one application window is required below.
            }
            if (window.getType() == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) {
                AccessibilityNodeInfo overlay = window.getRoot();
                if (overlay == null) return null;
                boolean own = overlay.getPackageName() != null && service.getPackageName().contentEquals(overlay.getPackageName());
                overlay.recycle();
                if (!own) return null;
            }
            // A notification shade or another system dialog may cover an allowed app.
            if (window.getType() == AccessibilityWindowInfo.TYPE_SYSTEM && (window.isActive() || window.isFocused())) return null;
        }
        if (target == null) return null;
        AccessibilityNodeInfo root = target.getRoot();
        if (root == null) return null;
        String name = root.getPackageName() == null ? "" : root.getPackageName().toString();
        root.recycle();
        try {
            PackageManager pm = service.getPackageManager();
            ApplicationInfo app = pm.getApplicationInfo(name, 0);
            String label = pm.getApplicationLabel(app).toString();
            boolean browser = pm.resolveActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).setPackage(name), 0) != null;
            boolean home = pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setPackage(name), 0) != null;
            boolean sensitiveCategory = app.category == ApplicationInfo.CATEGORY_SOCIAL;
            // Browsers fail closed: package metadata cannot establish URL, incognito or checkout policy.
            boolean system = home || sensitiveCategory || name.equals(service.getPackageName())
                || name.equals("com.android.systemui") || name.equals("com.android.settings")
                || name.equals("com.google.android.permissioncontroller") || name.equals("com.android.permissioncontroller");
            return AndroidScreenPolicy.allows(name, label, browser, system, count) ? new ScreenSource(name, target.getId()) : null;
        } catch (PackageManager.NameNotFoundException | RuntimeException unavailable) { return null; }
    }
    boolean matches(ScreenSource other) { return other != null && windowId == other.windowId && packageName.equals(other.packageName); }
}
