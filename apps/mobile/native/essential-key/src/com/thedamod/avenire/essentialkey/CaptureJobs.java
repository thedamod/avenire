package com.thedamod.avenire.essentialkey;

import android.app.job.*;
import android.content.*;
import android.os.*;

/** Persisted network-constrained wakeups; the outbox itself is the source of truth. */
final class CaptureJobs {
    static final int ID=78914;
    static void schedule(Context context) {
        try {
            // Replacing our running JobInfo would revoke its background execution window.
            if(CaptureJobService.isRunning()) return;
            long next=CaptureStore.next(context); if(next==Long.MAX_VALUE) return;
            JobInfo info=new JobInfo.Builder(ID,new ComponentName(context,CaptureJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
                .setMinimumLatency(Math.max(1000,next-System.currentTimeMillis())).setBackoffCriteria(15000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();
            context.getSystemService(JobScheduler.class).schedule(info);
        } catch(Exception error) { android.util.Log.w("AvenireCapture","Could not schedule capture retry",error); }
    }
    static void start(Context context) throws Exception {
        context.startService(new Intent(context,Class.forName("com.thedamod.avenire.essentialkey.AvaTaskService")).putExtra("capture",true));
    }
    static void kick(Context context) {
        schedule(context);
        try {
            start(context);
        } catch(Exception background) { /* JobScheduler will run it with background launch eligibility. */ }
    }
}
