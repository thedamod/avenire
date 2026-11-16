package com.thedamod.avenire.essentialkey;

public final class ShareControlsTest {
    private static void check(boolean condition) { if(!condition) throw new AssertionError(); }
    public static void main(String[] args) {
        for(String app:new String[]{"com.google.android.apps.docs", "com.google.android.apps.docs.editors.docs",
            "com.google.android.apps.docs.editors.sheets", "com.google.android.apps.docs.editors.slides"}) {
            check(ShareControls.supports(app));
            check(ShareControls.share(app," Send a copy "));
            check(ShareControls.exportMenu(app,"Share and export"));
            check(!ShareControls.exportMenu(app,"Share"));
            for(String label:new String[]{"Share", "Manage access", "Copy link", "Delete", "Avenire", "Send"})
                check(!ShareControls.share(app,label));
        }
        check(ShareControls.supports("com.adobe.reader"));
        check(ShareControls.share("com.adobe.reader","SHARE FILE"));
        check(!ShareControls.share("com.adobe.reader","Share and invite"));
        check(!ShareControls.share("com.adobe.reader",null));
        check(!ShareControls.supports("com.android.settings"));
        check(!ShareControls.supports("com.google.android.apps.docs.fake"));
        check(!ShareControls.supports("com.whatsapp"));
        check(ShareControls.overflow("More options"));
        check(!ShareControls.overflow("More information"));
        check(!ShareControls.overflow(null));
        check(!ShareControls.exportMenu("com.adobe.reader","Share and export"));
        System.out.println("Share control safety checks passed");
    }
}
