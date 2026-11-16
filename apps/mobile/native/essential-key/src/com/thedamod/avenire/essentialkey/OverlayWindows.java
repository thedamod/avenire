package com.thedamod.avenire.essentialkey;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.view.Display;
import android.view.WindowManager;
/** Resolve the current accessibility connection's token, including after service reconnects. */
final class OverlayWindows {
    static Context create(EssentialKeyService service) {
        Display display=service.getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
        if(display==null) throw new WindowManager.InvalidDisplayException("The current display is unavailable.");
        return service.createWindowContext(display,WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,null);
    }
}
