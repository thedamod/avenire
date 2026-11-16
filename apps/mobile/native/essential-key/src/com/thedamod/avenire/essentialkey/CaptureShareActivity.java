package com.thedamod.avenire.essentialkey;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.Toast;
import java.io.*;
import java.time.Instant;
import java.util.*;
import org.json.JSONObject;

/** Consumes only explicit Android Share grants; never opens caller-supplied filesystem paths. */
public final class CaptureShareActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Intent intent=getIntent();
        if(state!=null || getSystemService(KeyguardManager.class).isKeyguardLocked()) { finish(); return; }
        if(!Intent.ACTION_SEND.equals(intent.getAction()) && !Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) { finish(); return; }
        String owner=CaptureStore.owner(this);
        if(owner.isEmpty()) { Toast.makeText(this,"Sign in to Avenire, then share the original again.",Toast.LENGTH_LONG).show(); finish(); return; }
        ArrayList<Uri> streams=new ArrayList<>();
        if(Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> shared=intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if(shared!=null) streams.addAll(shared);
        } else { Uri stream=intent.getParcelableExtra(Intent.EXTRA_STREAM); if(stream!=null) streams.add(stream); }
        if(streams.isEmpty() && intent.getClipData()!=null) {
            if(intent.getClipData().getItemCount()>32) { Toast.makeText(this,"Share at most 32 originals at once.",Toast.LENGTH_LONG).show(); finish(); return; }
            for(int n=0;n<intent.getClipData().getItemCount();n++) { Uri uri=intent.getClipData().getItemAt(n).getUri(); if(uri!=null) streams.add(uri); }
        }
        CharSequence text=intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if(!streams.isEmpty() && (intent.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION)==0) { Toast.makeText(this,"The source app must grant access to its shared original.",Toast.LENGTH_LONG).show(); finish(); return; }
        if(streams.size()>32) { Toast.makeText(this,"Share at most 32 originals at once.",Toast.LENGTH_LONG).show(); finish(); return; }
        new Thread(() -> {
            int saved=0; Exception failure=null; JSONObject latest=null;
            try {
                if(streams.isEmpty()) {
                    String value=text==null?"":text.toString().trim();
                    if(value.length()>8192 || !value.matches("(?i)^https?://[^\\s]+$")) throw new IOException("Share the original file or a webpage URL with Avenire.");
                    latest=CaptureStore.stageUrl(this,owner,UUID.randomUUID().toString(),value); saved++;
                } else for(Uri uri:streams) {
                    latest=CaptureSources.stage(this,uri,owner,UUID.randomUUID().toString(),"",intent.getType()); saved++;
                }
            } catch(Exception error) { failure=error; }
            final int count=saved; final Exception error=failure; final JSONObject receipt=latest;
            runOnUiThread(() -> {
                if(receipt!=null && EssentialKeyService.live!=null) EssentialKeyService.live.showCaptureReceipt(receipt);
                if(count>0) CaptureJobs.kick(this);
                if(error!=null) Toast.makeText(this,(count>0?count+" queued. ":"")+error.getMessage(),Toast.LENGTH_LONG).show();
                else if(EssentialKeyService.live==null) Toast.makeText(this,"Original queued in Avenire.",Toast.LENGTH_SHORT).show();
                finish();
            });
        },"avenire-share-original").start();
    }
}
