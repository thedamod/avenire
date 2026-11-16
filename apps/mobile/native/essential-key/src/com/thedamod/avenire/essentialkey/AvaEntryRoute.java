package com.thedamod.avenire.essentialkey;

/** A missing process-local service reference does not mean permission is disabled. */
final class AvaEntryRoute {
    enum Target { OVERLAY, APP, SETUP }
    static Target choose(boolean widget, boolean bound, boolean enabled) {
        if (bound) return Target.OVERLAY;
        if (widget || enabled) return Target.APP;
        return Target.SETUP;
    }
}
