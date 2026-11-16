package com.thedamod.avenire.essentialkey;
import android.os.Bundle;
import android.service.voice.*;
public final class AvaAssistSessionService extends VoiceInteractionSessionService {
    @Override public VoiceInteractionSession onNewSession(Bundle args) { return new AvaAssistSession(this); }
}
