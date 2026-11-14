package com.thedamod.avenire.essentialkey;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Framed popover and Ava text dock, sharing one frozen preview and native composer. */
public final class AvaActivity extends Activity {
    static volatile boolean visible;
    static volatile boolean hasPreview;
    static volatile String activeEventId;
    private String mode;
    private View composer;
    private View sendControl;
    private EditText input;
    private TextView error;
    private String eventId;
    private boolean hapticPending;
    private View reveal;
    private Typeface geist;

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private int resource(String name, String type) { return getResources().getIdentifier(name, type, getPackageName()); }
    private int color(String name) { return getColor(resource("ava_" + name, "color")); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        geist = getResources().getFont(resource("avenire_geist", "font"));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        WindowManager.LayoutParams params = getWindow().getAttributes();
        params.dimAmount = 0.15f;
        getWindow().setAttributes(params);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        overridePendingTransition(0, 0);
        showPrompt(getIntent());
        if (getIntent().getBooleanExtra("captureRequested", false)) requestCapture();
        if (state != null) { hapticPending = false; reveal.animate().cancel(); reveal.setAlpha(1f); reveal.setScaleX(1f); reveal.setScaleY(1f); reveal.setTranslationX(0f); }
        if (state != null && eventId.equals(state.getString("eventId"))) {
            input.setText(state.getString("draft", ""));
        }
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if ("capture".equals(intent.getStringExtra("mode"))) { requestCapture(); return; }
        if (eventId.equals(intent.getStringExtra("eventId"))) {
            mode = intent.getStringExtra("mode");
            getIntent().putExtra("mode", mode);
            input.setHint("dock".equals(mode) ? "Ask Ava…" : "Add a note…");
            sendControl.setEnabled("popover".equals(mode) || !input.getText().toString().trim().isEmpty());
            sendControl.setAlpha(sendControl.isEnabled() ? 1f : 0.4f);
            sendControl.setContentDescription("popover".equals(mode) ? "Request capture" : "Send to Ava");
            if (android.animation.ValueAnimator.areAnimatorsEnabled()) {
                composer.setAlpha(0.7f); composer.animate().alpha(1f).setDuration(150).start();
            }
            hapticPending = intent.getBooleanExtra("fromKey", false); confirmOpen();
            if (intent.getBooleanExtra("captureRequested", false)) requestCapture();
            return;
        }
        saveDraft(); setIntent(intent); showPrompt(intent);
        if (intent.getBooleanExtra("captureRequested", false)) requestCapture();
    }
    @Override protected void onResume() { super.onResume(); visible = true; }
    @Override protected void onPause() { visible = false; saveDraft(); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString("eventId", eventId); state.putString("draft", input.getText().toString());
        super.onSaveInstanceState(state);
    }
    private void saveDraft() {
        if (input != null) getPreferences(MODE_PRIVATE).edit().putString("eventId", eventId).putString("draft", input.getText().toString()).apply();
    }
    private void showPrompt(Intent intent) {
        eventId = intent.getStringExtra("eventId");
        if (eventId == null) eventId = "manual";
        activeEventId = eventId;
        mode = "popover".equals(intent.getStringExtra("mode")) ? "popover" : "dock";
        String draft = eventId.equals(getPreferences(MODE_PRIVATE).getString("eventId", "")) ? getPreferences(MODE_PRIVATE).getString("draft", "") : "";
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.BOTTOM);
        root.setBackgroundColor(color("bg"));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime());
            view.setPadding(dp(24) + bars.left, bars.top + dp(12), dp(24) + bars.right, dp(12) + bars.bottom);
            return insets;
        });
        int[] gradient = {color("accent"), color("green"), color("amber"), color("accent")};
        hasPreview = intent.getBooleanExtra("preview", false);
        ScreenPreview preview = new ScreenPreview(this, hasPreview, gradient);
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, 0, 1);
        previewParams.bottomMargin = dp(12);
        root.addView(preview, previewParams);
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(dp(3), dp(3), dp(3), dp(3));
        float radius = getResources().getDimension(resource("ava_composer_radius", "dimen"));
        GradientDrawable background = new GradientDrawable();
        background.setColor(color("surface")); background.setCornerRadius(radius);
        bar.setBackground(background);
        composer = bar;
        bar.addView(control("close", "Dismiss Ava", false, () -> finish()));
        input = new EditText(this);
        input.setTypeface(geist); input.setTextSize(15); input.setTextColor(color("fg")); input.setHintTextColor(color("muted"));
        input.setHint("dock".equals(mode) ? "Ask Ava…" : "Add a note…"); input.setContentDescription("Ask Ava");
        input.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        input.setPadding(dp(4), dp(12), dp(4), dp(12)); input.setSingleLine(false); input.setMaxLines(3);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4000)});
        input.setOnEditorActionListener((view, action, event) -> {
            if (action == EditorInfo.IME_ACTION_SEND) { send(); return true; } return false;
        });
        bar.addView(input, new LinearLayout.LayoutParams(0, -2, 1));
        View send = control("up", "popover".equals(mode) ? "Request capture" : "Send to Ava", true, this::send);
        sendControl = send;
        bar.addView(send);
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                send.setEnabled("popover".equals(mode) || s.toString().trim().length() > 0); send.setAlpha(send.isEnabled() ? 1f : 0.4f);
                if (error != null) error.setVisibility(View.GONE);
            }
            @Override public void afterTextChanged(Editable value) {}
        });
        input.setText(draft); send.setEnabled("popover".equals(mode) || !draft.trim().isEmpty()); send.setAlpha(send.isEnabled() ? 1f : 0.4f);
        root.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        error = new TextView(this); error.setTypeface(geist); error.setTextColor(color("error")); error.setTextSize(12);
        error.setPadding(dp(16), dp(8), dp(16), 0); error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); error.setVisibility(View.GONE);
        root.addView(error);
        root.setFocusableInTouchMode(true); setContentView(root); root.requestFocus(); root.requestApplyInsets();
        root.post(() -> {
            android.view.WindowInsetsController controller = root.getWindowInsetsController();
            if (controller != null) controller.hide(android.view.WindowInsets.Type.statusBars());
        });
        hapticPending = intent.getBooleanExtra("fromKey", false);
        reveal = root;
        root.post(this::confirmOpen);
        if (android.animation.ValueAnimator.areAnimatorsEnabled()) {
            preview.setScaleX(1.15f); preview.setScaleY(1.15f);
            preview.animate().scaleX(1f).scaleY(1f).setDuration(200).setInterpolator(new android.view.animation.PathInterpolator(0.23f, 1f, 0.32f, 1f)).start();
            root.setAlpha(0f); root.setScaleX(0.97f); root.setScaleY(0.97f); root.setTranslationX(dp(24));
            root.post(() -> {
                root.setPivotX(root.getWidth()); root.setPivotY(root.getHeight()*0.38f);
                root.animate().alpha(1f).scaleX(1f).scaleY(1f).translationX(0f).setDuration(200)
                    .setInterpolator(new android.view.animation.PathInterpolator(0.23f, 1f, 0.32f, 1f)).start();
            });
        }
    }
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) confirmOpen();
    }
    private void confirmOpen() {
        if (hapticPending && reveal != null && reveal.hasWindowFocus()) {
            hapticPending = false;
            reveal.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM);
        }
    }
    private View control(String icon, String label, boolean accent, Runnable onPress) {
        FrameLayout target = new FrameLayout(this);
        target.setLayoutParams(new LinearLayout.LayoutParams(dp(44), dp(44)));
        target.setContentDescription(label); target.setClickable(true); target.setFocusable(true);
        target.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override public void onInitializeAccessibilityNodeInfo(View host, android.view.accessibility.AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info); info.setClassName("android.widget.Button");
            }
        });
        View mark = new View(this) {
            final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            @Override protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                if (accent) { paint.setStyle(Paint.Style.FILL); paint.setColor(color("accent")); canvas.drawCircle(getWidth()/2f, getHeight()/2f, dp(17), paint); }
                canvas.save(); canvas.translate((getWidth()-dp(18))/2f, (getHeight()-dp(18))/2f); canvas.scale(dp(18)/16f, dp(18)/16f);
                paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1.5f); paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
                paint.setColor(color(accent ? "on_accent" : "secondary"));
                if (icon.equals("close")) { canvas.drawLine(4.5f,4.5f,11.5f,11.5f,paint); canvas.drawLine(11.5f,4.5f,4.5f,11.5f,paint); }
                else if (icon.equals("up")) { canvas.drawLine(8,12.5f,8,3.5f,paint); canvas.drawLine(4.5f,7,8,3.5f,paint); canvas.drawLine(8,3.5f,11.5f,7,paint); }
                canvas.restore();
            }
        };
        mark.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        target.addView(mark, new FrameLayout.LayoutParams(-1, -1));
        target.setOnClickListener(view -> onPress.run());
        android.util.TypedValue ripple = new android.util.TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true);
        target.setForeground(getDrawable(ripple.resourceId));
        return target;
    }
    private void showError(String message) { error.setText(message); error.setVisibility(View.VISIBLE); }
    private void requestCapture() {
        saveDraft();
        android.util.Log.i("AvenireEssentialKey", "capture.requested eventId=" + eventId);
        // Integration hook only: never claim a file was saved or uploaded.
        android.widget.Toast.makeText(this, "Capture is not configured yet.", android.widget.Toast.LENGTH_SHORT).show();
        if (reveal != null) reveal.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM);
    }
    private void send() {
        if ("popover".equals(mode)) { requestCapture(); return; }
        String question = input.getText().toString().trim(); if (question.isEmpty()) return;
        saveDraft();
        Uri url = new Uri.Builder().scheme("avenire").authority("ask").appendQueryParameter("q", question).build();
        try { startActivity(new Intent(Intent.ACTION_VIEW, url).setPackage("com.thedamod.avenire")); finish(); }
        catch (ActivityNotFoundException unavailable) { showError("Open or update Avenire to continue. Your prompt is kept here."); }
    }
}
