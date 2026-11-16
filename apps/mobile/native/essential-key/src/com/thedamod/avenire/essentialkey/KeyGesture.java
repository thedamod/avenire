package com.thedamod.avenire.essentialkey;

/** Android-independent gesture state: one tap OR one hold, never both. */
final class KeyGesture {
    static final long HOLD_MS = 500;
    private long started = -1;
    private boolean held;
    boolean down(long time) {
        if (started >= 0) return false;
        started = time;
        held = false;
        return true;
    }
    boolean hold() {
        if (started < 0 || held) return false;
        held = true;
        return true;
    }
    String up(long time, boolean canceled) {
        if (started < 0) return null;
        String result = canceled || held ? null : time - started >= HOLD_MS ? "dock" : "popover";
        reset();
        return result;
    }
    void reset() { started = -1; held = false; }
}
