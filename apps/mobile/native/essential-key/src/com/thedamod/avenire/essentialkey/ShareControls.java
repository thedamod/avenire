package com.thedamod.avenire.essentialkey;

/** Exact control labels only: never select a destination or collaborator action. */
final class ShareControls {
    static boolean google(String app) {
        return java.util.Arrays.asList("com.google.android.apps.docs", "com.google.android.apps.docs.editors.docs",
            "com.google.android.apps.docs.editors.sheets", "com.google.android.apps.docs.editors.slides").contains(app);
    }
    static boolean supports(String app) {
        return google(app) || java.util.Arrays.asList("com.adobe.reader", "com.microsoft.office.word",
            "com.microsoft.office.excel", "com.microsoft.office.powerpoint", "cn.wps.moffice_eng").contains(app);
    }
    static String normalize(CharSequence label) {
        return label == null ? "" : label.toString().trim().toLowerCase(java.util.Locale.ROOT);
    }
    static boolean share(String app, CharSequence label) {
        String value=normalize(label);
        return value.equals("send a copy") || (!google(app) && (value.equals("share") || value.equals("share file")));
    }
    static boolean overflow(CharSequence label) {
        String value=normalize(label);
        return value.equals("more options") || value.equals("more") || value.equals("menu");
    }
    static boolean exportMenu(String app, CharSequence label) {
        String value=normalize(label);
        return google(app) && (value.equals("share and export") || value.equals("share & export"));
    }
}
