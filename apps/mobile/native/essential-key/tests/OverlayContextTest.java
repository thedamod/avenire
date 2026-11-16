package com.thedamod.avenire.essentialkey;

public final class OverlayContextTest {
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] args) {
        OverlayContext screen = new OverlayContext();
        check(!screen.windowChanged("gallery", false, false));
        screen.open();
        check(!screen.windowChanged("avenire", true, false));
        check(!screen.windowChanged("keyboard", false, true));
        check(screen.windowChanged("gallery", false, false)); // Same-app navigation is external too.
        check(screen.windowChanged("launcher", false, false));
        screen.close();
        check(!screen.windowChanged("browser", false, false));
        screen.open();
        check(!screen.windowChanged("keyboard", false, true));
        check(screen.windowChanged("browser", false, false));
        check(screen.windowChanged("systemui", false, false));
        OverlayContext cold = new OverlayContext();
        cold.open();
        check(!cold.windowChanged(null, false, false));
        check(cold.windowChanged("launcher", false, false));
        System.out.println("Overlay navigation: Home/app switch/system UI dismiss; keyboard and own windows remain open.");
    }
}
