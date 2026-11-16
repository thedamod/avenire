package com.thedamod.avenire.essentialkey;

/** Recognizes external window transitions without reading window contents. */
final class OverlayContext {
    private boolean active;
    void open() { active = true; }
    void close() { active = false; }
    boolean windowChanged(String name, boolean ownWindow, boolean keyboard) {
        if (name == null || ownWindow || keyboard) return false;
        return active; // Also leave on navigation within the same app or back to the launcher.
    }
}
