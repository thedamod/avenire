package com.thedamod.avenire.essentialkey;

import android.content.Context;
import android.graphics.*;
import android.os.*;
import android.view.*;
import android.view.accessibility.AccessibilityEvent;
import android.widget.*;
import org.json.JSONObject;

/** A small non-modal receipt. Only its own bounds intercept touches. */
final class CaptureReceipt extends LinearLayout {
    private final EssentialKeyService service;
    private final WindowManager windows;
    private final TextView label;
    private final View indicator;
    private final Button action;
    private final Button retry;
    private final ProgressBar progress;
    private final Handler main=new Handler(Looper.getMainLooper());
    private String id="";
    private String dismissedId="";
    private String phase="";
    private float pulse;
    private android.animation.ValueAnimator loader;
    private final Paint loaderPaint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path shape=new Path();
    private boolean attached;
    CaptureReceipt(EssentialKeyService service) {
        super(OverlayWindows.create(service)); this.service=service; windows=getContext().getSystemService(WindowManager.class);
        setOrientation(HORIZONTAL); setGravity(Gravity.CENTER_VERTICAL); setPadding(dp(16),dp(6),dp(8),dp(6));
        android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable(); background.setColor(0xF21B1B1B); background.setCornerRadius(dp(24)); setBackground(background); setElevation(dp(8));
        progress=new ProgressBar(service,null,android.R.attr.progressBarStyleHorizontal); progress.setMax(1000); progress.setProgressTintList(android.content.res.ColorStateList.valueOf(0xFFABC4FF)); progress.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFF292929));
        indicator=new View(service) {
            final Paint icon=new Paint(Paint.ANTI_ALIAS_FLAG);
            @Override protected void onDraw(Canvas canvas) {
                icon.setStyle(Paint.Style.STROKE); icon.setColor(phase.equals("ready")?0xFF9CD4B2:0xFFABC4FF); icon.setStrokeWidth(dp(1.5f)); icon.setStrokeCap(Paint.Cap.ROUND); icon.setStrokeJoin(Paint.Join.ROUND);
                float x=getWidth()/2f,y=getHeight()/2f;
                if(phase.equals("ready") || phase.equals("undone")) { canvas.drawLine(x-dp(6),y,x-dp(2),y+dp(4),icon); canvas.drawLine(x-dp(2),y+dp(4),x+dp(7),y-dp(5),icon); }
                else { canvas.drawRoundRect(x-dp(7),y-dp(7),x+dp(7),y+dp(7),dp(3),dp(3),icon); canvas.drawLine(x-dp(3),y,x+dp(3),y,icon); canvas.drawLine(x,y-dp(3),x,y+dp(3),icon); }
            }
        }; indicator.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); addView(indicator,new LayoutParams(dp(28),dp(32)));
        android.graphics.Typeface font=getResources().getFont(getResources().getIdentifier("avenire_geist","font",service.getPackageName()));
        label=new TextView(service); label.setTypeface(font); label.setTextColor(0xFFEDEDED); label.setTextSize(14); label.setMaxLines(2);
        addView(label,new LayoutParams(0,LayoutParams.WRAP_CONTENT,1));
        action=new Button(service); action.setTypeface(font); action.setTextSize(13); action.setTextColor(0xFFABC4FF); action.setMinHeight(dp(44)); action.setMinimumWidth(dp(64)); action.setBackgroundColor(Color.TRANSPARENT); addView(action);
        retry=new Button(service); retry.setTypeface(font); retry.setText("Retry"); retry.setTextColor(0xFFABC4FF); retry.setTextSize(13); retry.setMinHeight(dp(44)); retry.setMinimumWidth(dp(52)); retry.setBackgroundColor(Color.TRANSPARENT); retry.setOnClickListener(v -> act("retry")); addView(retry);
        Button dismiss=new Button(service); dismiss.setText("×"); dismiss.setTextColor(0xFFAAAAAA); dismiss.setTextSize(18); dismiss.setMinHeight(dp(44)); dismiss.setMinimumWidth(dp(44)); dismiss.setPadding(0,0,0,0); dismiss.setBackgroundColor(Color.TRANSPARENT); dismiss.setContentDescription("Dismiss capture status"); dismiss.setOnClickListener(v -> { dismissedId=id; hide(); }); addView(dismiss);
        setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
    }
    private int dp(float value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    void show(JSONObject row) {
        if(!row.optString("owner").equals(CaptureStore.owner(service))) return;
        if(dismissedId.equals(row.optString("id"))) return;
        if(!id.equals(row.optString("id"))) progress.setProgress(0);
        id=row.optString("id"); phase=row.optString("phase");
        String text=phase.equals("queued")?"Capture queued":phase.equals("acquiring")?"Getting original…":phase.equals("uploading")?"Saving capture…":phase.equals("extracting")?"Saved · extracting…":phase.equals("ready")?"Capture ready":phase.equals("partial")?"Saved · partial extraction":phase.equals("undoing")?"Undoing capture…":phase.equals("undone")?"Capture undone":phase.equals("paused")?"Saved · processing paused":phase.equals("failed")?row.optString("error","Capture needs attention"):"Waiting to retry capture";
        indicator.invalidate(); label.setText(text); label.setContentDescription(text);
        boolean working=!CaptureStore.terminal(phase);
        if(loader!=null) { loader.cancel(); loader=null; }
        if(working && android.animation.ValueAnimator.areAnimatorsEnabled()) {
            loader=android.animation.ValueAnimator.ofFloat(0,1); loader.setDuration(1400); loader.setRepeatCount(android.animation.ValueAnimator.INFINITE); loader.setInterpolator(new android.view.animation.LinearInterpolator());
            loader.addUpdateListener(animation -> { pulse=(float)animation.getAnimatedValue(); invalidate(); }); loader.start();
        }
        // Progress belongs behind the receipt text; it does not obscure or block the app.
        boolean failed=phase.equals("failed") || phase.equals("paused"); action.setText("Undo"); action.setContentDescription("Undo capture"); retry.setVisibility(failed?VISIBLE:GONE);
        action.setVisibility(phase.equals("undone") || phase.equals("undoing")?GONE:VISIBLE);
        action.setOnClickListener(v -> act("undo"));
        main.removeCallbacksAndMessages(null);
        if(!attached) {
            WindowManager.LayoutParams params=new WindowManager.LayoutParams(Math.min(getResources().getDisplayMetrics().widthPixels-dp(32),dp(380)),dp(58),WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
            params.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL; params.y=dp(12); windows.addView(this,params); attached=true;
        }
        setContentDescription(text); sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED);
        if(!working && !failed) main.postDelayed(this::hide,phase.equals("undone")?2500:12000);
        invalidate();
    }
    private void act(String actionName) {
        try { if(actionName.equals("undo")) CaptureTransfer.cancel(id); JSONObject row=CaptureStore.action(service,id,actionName); show(row); CaptureJobs.kick(service); }
        catch(Exception error) { label.setText(error.getMessage()); }
    }
    void status(String captureId,int loaded,int total) { if(id.equals(captureId)) { progress.setProgress(total>0?(int)(1000L*loaded/total):0); invalidate(); } }
    @Override protected void dispatchDraw(Canvas canvas) {
        canvas.save(); shape.reset(); shape.addRoundRect(new RectF(0,0,getWidth(),getHeight()),dp(24),dp(24),Path.Direction.CW); canvas.clipPath(shape);
        Paint paint=loaderPaint; paint.setColor(0x183F76E8);
        float fraction=progress.getProgress()/1000f;
        if(!CaptureStore.terminal(phase)) {
            if(phase.equals("uploading") && fraction>0) canvas.drawRect(0,0,getWidth()*fraction,getHeight(),paint);
            else canvas.drawRect((pulse*1.4f-0.4f)*getWidth(),0,pulse*1.4f*getWidth(),getHeight(),paint);
        }
        canvas.restore(); super.dispatchDraw(canvas);
    }
    void hide() { if(loader!=null) { loader.cancel(); loader=null; } main.removeCallbacksAndMessages(null); if(attached) { windows.removeView(this); attached=false; } }
}
