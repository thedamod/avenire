package com.thedamod.avenire.essentialkey;

public final class AndroidScreenPolicyTest {
    private static void deny(String name, String label, boolean browser, boolean system, int windows) {
        if (AndroidScreenPolicy.allows(name, label, browser, system, windows)) throw new AssertionError("Allowed excluded screen: " + name);
    }
    public static void main(String[] args) {
        deny("com.google.android.gm", "Gmail", false, false, 1);
        deny("com.whatsapp.w4b", "WhatsApp Business", false, false, 1);
        deny("com.x8bit.bitwarden", "Bitwarden", false, false, 1);
        deny("com.chase.sig.android", "Chase", false, false, 1);
        deny("com.phonepe.app", "PhonePe", false, false, 1);
        deny("com.instagram.android", "Instagram", false, false, 1);
        deny("com.netflix.mediaclient", "Netflix", false, false, 1);
        deny("org.example.other", "Example Bank", false, false, 1);
        deny("org.example.browser", "Unknown Browser", true, false, 1);
        deny("com.android.launcher", "Launcher", false, true, 1);
        deny("org.chromium.webapk.generated", "Article", false, false, 1);
        deny(null, "Unknown", false, false, 1);
        deny("org.example.reader", "Reader", false, false, 0);
        deny("org.example.reader", "Reader", false, false, 2);
        if (!AndroidScreenPolicy.allows("org.example.reader", "PDF Reader", false, false, 1)) throw new AssertionError("Reader excluded");
        System.out.println("Android screen policy tests passed");
    }
}
