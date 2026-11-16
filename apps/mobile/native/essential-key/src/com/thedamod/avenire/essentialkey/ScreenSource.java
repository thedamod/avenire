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
    final String title;
    final boolean mediaApp;
    private ScreenSource(String name, int id, String label, String url,String title,boolean mediaApp) { packageName = name; windowId = id; this.label=label; this.url=url; this.title=title; this.mediaApp=mediaApp; }
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
        if (target == null) { android.util.Log.i("AvenireCapture","Source gate: no application window"); return null; }
        AccessibilityNodeInfo root = target.getRoot();
        if (root == null) { android.util.Log.i("AvenireCapture","Source gate: inaccessible application root"); return null; }
        String name = root.getPackageName() == null ? "" : root.getPackageName().toString();
        try {
            PackageManager pm = service.getPackageManager();
            ApplicationInfo app = pm.getApplicationInfo(name, 0);
            String label = pm.getApplicationLabel(app).toString();
            boolean browser = name.startsWith("org.chromium.webapk") || handles(pm,new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")),name);
            boolean home = handles(pm,new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),name);
            // Browser chrome provides the narrower URL/private-tab gate. OEM category hints
            // must not turn every browser into a blocked social app.
            boolean sensitiveCategory = !browser && app.category == ApplicationInfo.CATEGORY_SOCIAL;
            BrowserSource page=browser?BrowserSource.inspect(root,target.getTitle()):null;
            if(page!=null && (page.privateMode || page.url==null || !AndroidScreenPolicy.permitsUrl(page.url))) { android.util.Log.i("AvenireCapture","Source gate: browser metadata excluded"); return null; }
            boolean system = home || sensitiveCategory || name.equals(service.getPackageName())
                || name.equals("com.android.systemui") || name.equals("com.android.settings")
                || name.equals("com.google.android.permissioncontroller") || name.equals("com.android.permissioncontroller");
            boolean allowed=AndroidScreenPolicy.allows(name, label, browser, system, count);
            android.util.Log.i("AvenireCapture","Source gate allowed="+allowed+" browser="+browser+" system="+system+" windows="+count);
            String title=target.getTitle()==null?label:target.getTitle().toString();
            return allowed ? new ScreenSource(name, target.getId(),label,page==null?null:page.url,title,app.category==ApplicationInfo.CATEGORY_VIDEO || app.category==ApplicationInfo.CATEGORY_AUDIO) : null;
        } catch (PackageManager.NameNotFoundException | RuntimeException unavailable) { android.util.Log.i("AvenireCapture","Source gate: application metadata unavailable"); return null; }
        finally { root.recycle(); }
    }
    private static boolean handles(PackageManager pm,Intent intent,String name) {
        // Enumerate real handlers. resolveActivity may synthesize a chooser even for
        // an unmatched intent, or hide multiple matching activities behind a resolver.
        for(android.content.pm.ResolveInfo result:pm.queryIntentActivities(intent.setPackage(name),0))
            if(result.activityInfo!=null && name.equals(result.activityInfo.packageName)) return true;
        return false;
    }
    boolean matches(ScreenSource other) { return other != null && windowId == other.windowId && packageName.equals(other.packageName) && java.util.Objects.equals(url,other.url) && java.util.Objects.equals(title,other.title); }
}
