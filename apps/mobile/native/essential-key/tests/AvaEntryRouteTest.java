package com.thedamod.avenire.essentialkey;

public final class AvaEntryRouteTest {
    static void check(AvaEntryRoute.Target expected, boolean widget, boolean bound, boolean enabled) {
        if (AvaEntryRoute.choose(widget, bound, enabled) != expected) throw new AssertionError("Wrong Ava entry destination");
    }
    public static void main(String[] args) {
        check(AvaEntryRoute.Target.OVERLAY, true, true, true);
        check(AvaEntryRoute.Target.APP, true, false, false);
        check(AvaEntryRoute.Target.APP, true, false, true);
        check(AvaEntryRoute.Target.OVERLAY, false, true, true);
        check(AvaEntryRoute.Target.APP, false, false, true);
        check(AvaEntryRoute.Target.SETUP, false, false, false);
        System.out.println("Ava entry routing tests passed");
    }
}
