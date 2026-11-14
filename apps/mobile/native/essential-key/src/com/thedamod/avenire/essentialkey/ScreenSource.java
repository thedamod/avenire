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

/** Reads package/window metadata only. Only browser toolbar metadata is inspected; page bodies and form fields stay unread. */
final class ScreenSource {
    final String packageName;
    final int windowId;
    final String label;
    final String url;
    private ScreenSource(String name, int id, String label, String url) { packageName = name; windowId = id; this.label=label; this.url=url; }
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
        try {
            PackageManager pm = service.getPackageManager();
            ApplicationInfo app = pm.getApplicationInfo(name, 0);
            String label = pm.getApplicationLabel(app).toString();
            boolean browser = name.startsWith("org.chromium.webapk") || pm.resolveActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).setPackage(name), 0) != null;
            boolean home = pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setPackage(name), 0) != null;
            boolean sensitiveCategory = app.category == ApplicationInfo.CATEGORY_SOCIAL;
            BrowserSource page=browser?BrowserSource.inspect(root,target.getTitle()):null;
            if(page!=null && (page.privateMode || page.url==null || !AndroidScreenPolicy.permitsUrl(page.url))) return null;
            boolean system = home || sensitiveCategory || name.equals(service.getPackageName())
                || name.equals("com.android.systemui") || name.equals("com.android.settings")
                || name.equals("com.google.android.permissioncontroller") || name.equals("com.android.permissioncontroller");
            return AndroidScreenPolicy.allows(name, label, browser, system, count) ? new ScreenSource(name, target.getId(),label,page==null?null:page.url) : null;
        } catch (PackageManager.NameNotFoundException | RuntimeException unavailable) { return null; }
        finally { root.recycle(); }
    }
    boolean matches(ScreenSource other) { return other != null && windowId == other.windowId && packageName.equals(other.packageName) && java.util.Objects.equals(url,other.url); }
}
