package com.thedamod.avenire.essentialkey;

import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;
import java.util.Locale;

/** Bounded browser-chrome inspection. Web content, password fields and form text are never read. */
final class BrowserSource {
    final String url;
    final boolean privateMode;
    private BrowserSource(String url,boolean privateMode) { this.url=url; this.privateMode=privateMode; }
    static BrowserSource inspect(AccessibilityNodeInfo root,CharSequence windowTitle) {
        String url=null; boolean privateMode=AndroidScreenPolicy.privateMarker(windowTitle==null?"":windowTitle.toString());
        ArrayDeque<AccessibilityNodeInfo> pending=new ArrayDeque<>();
        for(int i=0;i<root.getChildCount();i++) { AccessibilityNodeInfo child=root.getChild(i); if(child!=null) pending.add(child); }
        int seen=0;
        while(!pending.isEmpty() && seen++<512) {
            AccessibilityNodeInfo node=pending.remove();
            try {
                String clazz=node.getClassName()==null?"":node.getClassName().toString();
                // Do not enter a page's accessibility tree or read its title/body/forms.
                if(clazz.contains("WebView") || clazz.contains("ContentView")) continue;
                String id=node.getViewIdResourceName(); String name=id==null?"":id.toLowerCase(Locale.ROOT);
                String description=node.getContentDescription()==null?"":node.getContentDescription().toString();
                if(node.isVisibleToUser()) {
                    boolean privateControl=name.matches(".*(?:incognito|private|secret).*");
                    boolean toggle=name.matches(".*(?:toggle|switch|button).*");
                    if(privateControl && (!toggle || node.isChecked() || node.isSelected())) privateMode=true;
                    if(AndroidScreenPolicy.privateMarker(description) && !description.toLowerCase(Locale.ROOT).matches(".*(?:open|new|switch to|enter).*")) privateMode=true;
                    if(name.matches(".*(?:url_bar|urlbar|mozac_browser_toolbar_url_view|address_bar|location_bar_edit_text|browser_toolbar_url_view|toolbar_url_view)$") && !node.isPassword()) {
                        CharSequence text=node.getText(); if(text!=null) { String candidate=text.toString().trim(); if(!candidate.contains("://")) candidate="https://"+candidate; if(candidate.length()<8192 && candidate.matches("(?i)^https?://[^\\s]+")) url=candidate; }
                    }
                }
                for(int i=0;i<node.getChildCount();i++) { AccessibilityNodeInfo child=node.getChild(i); if(child!=null) pending.add(child); }
            } finally { node.recycle(); }
        }
        while(!pending.isEmpty()) pending.remove().recycle();
        // A hidden toolbar is unverified rather than evidence that a private tab is ordinary.
        return new BrowserSource(url,privateMode || seen>=512);
    }
}
