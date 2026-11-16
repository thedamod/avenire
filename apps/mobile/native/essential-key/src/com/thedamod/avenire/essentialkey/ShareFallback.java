package com.thedamod.avenire.essentialkey;

import android.app.KeyguardManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

/** Bounded, user-triggered navigation to sharing. Never interacts with the chooser. */
final class ShareFallback {
    private final EssentialKeyService service;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private String app;
    private boolean menuOpened;
    private boolean exportOpened;
    private long deadline;
    private final Runnable step=this::step;
    ShareFallback(EssentialKeyService service) { this.service=service; }
    void start(String app) {
        cancel();
        if(!ShareControls.supports(app)) return;
        this.app=app; menuOpened=false; exportOpened=false; deadline=SystemClock.elapsedRealtime()+3000;
        handler.postDelayed(step,200);
    }
    void cancel() { app=null; handler.removeCallbacks(step); }
    private void unavailable() {
        cancel();
        android.widget.Toast.makeText(service,"Open the app's Send a copy or Share menu, then choose Avenire.",android.widget.Toast.LENGTH_LONG).show();
    }
    private void step() {
        if(app==null) return;
        if(EssentialKeyService.live!=service || service.getSystemService(KeyguardManager.class).isKeyguardLocked()) { cancel(); return; }
        if(SystemClock.elapsedRealtime()>=deadline) { unavailable(); return; }
        AccessibilityNodeInfo root=null;
        try {
            root=service.getRootInActiveWindow();
            if(root==null) { unavailable(); return; }
            // Switching apps, a system chooser or another accessibility overlay ends automation.
            if(!app.contentEquals(root.getPackageName()==null?"":root.getPackageName())) { cancel(); return; }
            for(AccessibilityWindowInfo window:service.getWindows()) {
                if(window.getType()==AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY
                    || (window.getType()==AccessibilityWindowInfo.TYPE_SYSTEM && (window.isActive() || window.isFocused()))) { cancel(); return; }
                if(window.getType()==AccessibilityWindowInfo.TYPE_APPLICATION) {
                    AccessibilityNodeInfo other=window.getRoot();
                    if(other==null) { cancel(); return; }
                    try { if(!app.contentEquals(other.getPackageName()==null?"":other.getPackageName())) { cancel(); return; } }
                    finally { other.recycle(); }
                }
            }
            int[] remaining={180};
            if(click(root,0,0,remaining)) { cancel(); return; }
            remaining[0]=180;
            if(!exportOpened && click(root,2,0,remaining)) exportOpened=true;
            else if(!menuOpened && !exportOpened) {
                remaining[0]=180;
                if(click(root,1,0,remaining)) menuOpened=true;
            }
            handler.postDelayed(step,200);
        } catch(RuntimeException stale) { unavailable(); }
        finally { if(root!=null) root.recycle(); }
    }
    private boolean click(AccessibilityNodeInfo node,int action,int depth,int[] remaining) {
        if(depth>14 || --remaining[0]<0 || node.isEditable() || node.isPassword()) return false;
        if(!app.contentEquals(node.getPackageName()==null?"":node.getPackageName())) return false;
        if(node.isVisibleToUser() && node.isEnabled()) {
            String id=node.getViewIdResourceName();
            String type=node.getClassName()==null?"":node.getClassName().toString();
            if(type.contains("WebView") || type.contains("ContentView")) return false;
            // Text is inspected only on toolbar/menu controls, never document bodies.
            boolean control=type.endsWith("Button") || (id!=null && (id.equals("android:id/title")
                || id.equals(app+":id/title") || id.contains(":id/menu_") || id.contains(":id/action_") || id.contains(":id/share")));
            CharSequence description=node.isClickable()?node.getContentDescription():null;
            CharSequence text=control?node.getText():null;
            boolean matches=action==1 ? ShareControls.overflow(description) || ShareControls.overflow(text)
                : action==2 ? ShareControls.exportMenu(app,description) || ShareControls.exportMenu(app,text)
                : ShareControls.share(app,description) || ShareControls.share(app,text);
            if(matches) {
                if(node.isClickable()) return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                AccessibilityNodeInfo parent=node.getParent();
                for(int level=0;parent!=null && level<4;level++) {
                    AccessibilityNodeInfo next=null;
                    try {
                        if(!app.contentEquals(parent.getPackageName()==null?"":parent.getPackageName())) return false;
                        if(parent.isClickable() && parent.isEnabled() && parent.isVisibleToUser()) return parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        if(level<3) next=parent.getParent();
                    } finally { parent.recycle(); }
                    parent=next;
                }
            }
        }
        for(int i=0;i<node.getChildCount() && remaining[0]>0;i++) {
            AccessibilityNodeInfo child=node.getChild(i);
            if(child!=null) try { if(click(child,action,depth+1,remaining)) return true; }
            finally { child.recycle(); }
        }
        return false;
    }
}
