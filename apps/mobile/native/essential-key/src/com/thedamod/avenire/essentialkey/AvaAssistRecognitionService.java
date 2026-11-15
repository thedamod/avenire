package com.thedamod.avenire.essentialkey;
import android.content.Intent;
import android.speech.*;
/** Android requires a recognizer component for assistant eligibility. Ava is text-only. */
public final class AvaAssistRecognitionService extends RecognitionService {
    @Override protected void onStartListening(Intent intent,Callback callback) { try { callback.error(SpeechRecognizer.ERROR_CLIENT); } catch(android.os.RemoteException ignored) { } }
    @Override protected void onCancel(Callback callback) { }
    @Override protected void onStopListening(Callback callback) { }
}
