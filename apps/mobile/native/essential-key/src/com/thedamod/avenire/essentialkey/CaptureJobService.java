package com.thedamod.avenire.essentialkey;

import android.app.job.*;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

public final class CaptureJobService extends JobService {
    private static volatile CaptureJobService active;
    private JobParameters running;
    private final Handler main=new Handler(Looper.getMainLooper());
    @Override public boolean onStartJob(JobParameters params) {
        active=this; running=params;
        try { CaptureJobs.start(this); } catch(Exception error) { main.post(() -> { jobFinished(params,true); running=null; active=null; }); return true; }
        main.postDelayed(() -> finish(),240000);
        return true;
    }
    static boolean complete() { CaptureJobService service=active; if(service==null) return false; service.main.post(service::finish); return true; }
    static boolean isRunning() { return active!=null; }
    private void finish() { if(running!=null) { jobFinished(running,false); running=null; } main.removeCallbacksAndMessages(null); active=null; CaptureJobs.schedule(this); }
    @Override public boolean onStopJob(JobParameters params) { running=null; active=null; main.removeCallbacksAndMessages(null); return true; }
}
