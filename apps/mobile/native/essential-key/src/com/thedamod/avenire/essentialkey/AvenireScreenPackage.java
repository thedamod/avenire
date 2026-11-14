package com.thedamod.avenire.essentialkey;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;

public final class AvenireScreenPackage implements ReactPackage {
    @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) { return android.os.Build.VERSION.SDK_INT >= 31 ? Collections.singletonList(new AvenireScreenModule(context)) : Collections.emptyList(); }
    @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) { return Collections.emptyList(); }
}
