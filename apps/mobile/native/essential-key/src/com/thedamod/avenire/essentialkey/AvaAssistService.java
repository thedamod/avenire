package com.thedamod.avenire.essentialkey;

import android.os.Bundle;
import android.service.voice.VoiceInteractionService;

/** Optional system assistant bridge. No microphone, hotword or continuous observation. */
public final class AvaAssistService extends VoiceInteractionService {
    static volatile AvaAssistService live;
    @Override public void onReady() { super.onReady(); live=this; }
    @Override public void onShutdown() { live=null; super.onShutdown(); }
    static boolean request(String session) {
        AvaAssistService service=live;
        if(service==null || !VoiceInteractionService.isActiveService(service,new android.content.ComponentName(service,AvaAssistService.class))) return false;
        Bundle args=new Bundle(); args.putString("captureSession",session);
        service.showSession(args,android.service.voice.VoiceInteractionSession.SHOW_WITH_ASSIST); return true;
    }
}
