package com.thedamod.avenire.essentialkey;

public final class KeyGestureTest {
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] args) {
        KeyGesture key = new KeyGesture();
        check(key.up(100, false) == null); // Orphan release cannot capture.
        check(key.down(100));
        check(!key.down(110)); // Duplicate/repeated down cannot reset the hold timer.
        check("popover".equals(key.up(599, false))); // First tap is immediate, not delayed for double-click.
        check(key.down(1000));
        check(key.hold()); // Ava opens while the key is still held.
        check(!key.hold());
        check(key.up(1800, false) == null); // Release after hold must never capture.
        check(key.down(2000));
        check("dock".equals(key.up(2500, false))); // Boundary even if timer is late.
        check(key.down(3000));
        check(key.up(3100, true) == null); // Canceled tap.
        check(key.down(4000));
        key.reset(); // Service interrupt/unbind/destroy.
        check(!key.hold());
        check(key.up(4800, false) == null);
        System.out.println("KeyGesture edge cases passed");
    }
}
