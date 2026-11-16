package com.thedamod.avenire.essentialkey;

import android.app.assist.AssistContent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.*;
import android.service.voice.VoiceInteractionSession;
import org.json.JSONObject;

/** Reads only system-provided original URIs. Never traverses AssistStructure or page text. */
final class AvaAssistSession extends VoiceInteractionSession {
    private final Context context;
    private final Handler main=new Handler(Looper.getMainLooper());
    private String session="";
    private boolean received;
    private Runnable timeout;
    AvaAssistSession(Context context) { super(context); this.context=context; }
    @Override public void onShow(Bundle args,int flags) {
        setUiEnabled(false); received=false; session=args==null?"":args.getString("captureSession","");
        if(session.isEmpty()) { hide(); main.postDelayed(() -> { EssentialKeyService service=EssentialKeyService.live; if(service!=null) service.trigger("toggle",true); },150); return; }
        String request=session;
        if(timeout!=null) main.removeCallbacks(timeout);
        timeout=() -> { if(!received && request.equals(session)) fail(request,"The app did not provide an original. Use Share → Avenire."); };
        main.postDelayed(timeout,8000);
    }
    @Override public void onHandleAssist(AssistState state) {
        if(session.isEmpty() || received || !state.isFocused()) return;
        received=true; if(timeout!=null) main.removeCallbacks(timeout);
        EssentialKeyService service=EssentialKeyService.live;
        if(service==null || !service.captureAllowed(session)) { fail(session,"The source changed or is excluded by capture policy."); return; }
        AssistContent content=state.getAssistContent();
        Uri intentData=content!=null && content.getIntent()!=null?content.getIntent().getData():null;
        String scheme=intentData==null?"none":intentData.getScheme();
        String safeScheme=java.util.Arrays.asList("content","http","https","file").contains(scheme)?scheme:"other";
        android.util.Log.i("AvenireCapture","Assistant original response content="+(content!=null)
            +" intentData="+(content!=null && content.getIntent()!=null && content.getIntent().getData()!=null)
            +" clips="+(content!=null && content.getClipData()!=null?content.getClipData().getItemCount():0)
            +" web="+(content!=null && content.getWebUri()!=null)+" intentScheme="+safeScheme);
        Uri original=null;
        if(content!=null) {
            Intent intent=content.getIntent();
            if(intent!=null && intent.getData()!=null && "content".equals(intent.getData().getScheme())) original=intent.getData();
            if(original==null && content.getClipData()!=null) {
                for(int i=0;i<Math.min(32,content.getClipData().getItemCount());i++) { Uri uri=content.getClipData().getItemAt(i).getUri(); if(uri!=null && "content".equals(uri.getScheme())) { original=uri; break; } }
            }
            if(original==null) original=content.getWebUri();
            if(original==null && intentData!=null && ("https".equals(scheme) || "http".equals(scheme))) original=intentData;
        }
        if(original==null) {
            fail(session,"projector-id".equals(scheme)
                ? "This Drive viewer doesn't share the original with Ava. In Drive, use Send a copy → Avenire."
                : "This app did not provide its original file or URL. Use Share → Avenire."); return;
        }
        String owner=CaptureStore.owner(context),request=session;
        if(owner.isEmpty()) { fail(request,"Sign in to Avenire before capturing."); return; }
        Uri source=original;
        String mime=content!=null && content.getIntent()!=null?content.getIntent().getType():null;
        if(mime==null && content!=null && content.getClipData()!=null && content.getClipData().getDescription().getMimeTypeCount()>0) mime=content.getClipData().getDescription().getMimeType(0);
        String hint=mime;
        boolean requireMedia=service.captureMediaExpected() || (hint!=null && (hint.startsWith("audio/") || hint.startsWith("video/")));
        Thread copy=new Thread(() -> {
            try {
                JSONObject row;
                if("content".equals(source.getScheme())) row=CaptureSources.stage(context,source,owner,request,service.captureNote(),hint);
                else if("https".equals(source.getScheme()) || "http".equals(source.getScheme())) row=CaptureStore.stageUrl(context,owner,request,source.toString(),requireMedia);
                else throw new java.io.IOException("The app provided a playback identifier, not a readable original.");
                main.post(() -> { service.assistCaptureFinished(request,row,null); hide(); });
            } catch(Exception error) { android.util.Log.w("AvenireCapture","Assistant original copy failed: "+error.getClass().getSimpleName()); main.post(() -> fail(request,"Original unavailable: "+error.getMessage()+" Use Share → Avenire.")); }
        },"avenire-assist-original");
        copy.start();
    }
    private void fail(String request,String message) { EssentialKeyService service=EssentialKeyService.live; if(service!=null) service.assistCaptureFinished(request,null,message); hide(); }
    @Override public void onHide() {
        if(timeout!=null) main.removeCallbacks(timeout);
        if(!received && !session.isEmpty()) { EssentialKeyService service=EssentialKeyService.live; if(service!=null) service.assistCaptureFinished(session,null,"Original request closed. Try again."); session=""; }
        super.onHide();
    }
    @Override public void onDestroy() { main.removeCallbacksAndMessages(null); super.onDestroy(); }
}
