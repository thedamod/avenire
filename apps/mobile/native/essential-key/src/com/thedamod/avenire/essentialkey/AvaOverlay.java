package com.thedamod.avenire.essentialkey;

import android.content.Context;
import android.content.SharedPreferences;
import android.view.ContextThemeWrapper;
import android.graphics.PixelFormat;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
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

/** Service-owned accessibility window: no Activity, task switch, or platform launch transition. */
final class AvaOverlay extends ContextThemeWrapper {
    private final WindowManager windows;
    private final EssentialKeyService service;
    private final java.util.function.Consumer<Boolean> onDismiss;
    private boolean handoff;
    private android.widget.ScrollView transcript;
    private LinearLayout turns;
    private TextView response;
    private boolean busy;
    private LinearLayout root;
    private boolean attached;
    private boolean closing;
    private ScreenPreview preview;
    private android.window.OnBackInvokedDispatcher backDispatcher;
    private final android.window.OnBackInvokedCallback backCallback;
    private String mode;
    private View composer;
    private View sendControl;
    private EditText input;
    private TextView error;
    private String eventId;
    private boolean hapticPending;
    private View reveal;
    private Typeface geist;
    private OverlayMarkdown markdown;

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private int resource(String name, String type) { return getResources().getIdentifier(name, type, getPackageName()); }
    private int color(String name) { return getColor(resource("ava_" + name, "color")); }
    AvaOverlay(EssentialKeyService service, String eventId, String mode, boolean preview, java.util.function.Consumer<Boolean> onDismiss) {
        super(service, service.getResources().getIdentifier("AvenireKeySheet", "style", service.getPackageName()));
        this.service = service;
        this.windows = service.getSystemService(WindowManager.class);
        backCallback = android.os.Build.VERSION.SDK_INT >= 33 ? this::dismiss : null;
        this.onDismiss = onDismiss;
        geist = getResources().getFont(resource("avenire_geist", "font"));
        markdown = new OverlayMarkdown(this, color("accent"), color("fg"), color("surface"));
        markdown.onOpenLink(this::dismiss);
        showPrompt(new Intent().putExtra("eventId", eventId).putExtra("mode", mode)
            .putExtra("preview", preview).putExtra("fromKey", true), true);
    }
    void show() {
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_DIM_BEHIND,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.windowAnimations = 0;
        params.dimAmount = 1f;
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN;
        params.setFitInsetsTypes(0);
        params.setTitle("Avenire Ava");
        windows.addView(root, params);
        attached = true;
        root.requestFocus(); root.requestApplyInsets(); root.post(this::confirmOpen);
        if (android.os.Build.VERSION.SDK_INT >= 33) root.post(() -> {
            backDispatcher = root.findOnBackInvokedDispatcher();
            if (backDispatcher != null) backDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        });
    }
    void updateMode(String mode) {
        if (closing) {
            closing = false; composer.animate().cancel();
            composer.animate().alpha(1f).translationY(0f).setDuration(150).start();
            preview.settleIntoFrame();
        }
        this.mode = mode;
        input.setHint("dock".equals(mode) ? "Ask Ava…" : "Add a note…");
        sendControl.setEnabled(!busy && ("popover".equals(mode) || !input.getText().toString().trim().isEmpty()));
        sendControl.setAlpha(sendControl.isEnabled() ? 1f : 0.4f);
        sendControl.setContentDescription("popover".equals(mode) ? "Request capture" : "Send to Ava");
        if (android.animation.ValueAnimator.areAnimatorsEnabled()) {
            composer.setAlpha(0.7f); composer.animate().alpha(1f).setDuration(150).start();
        }
        hapticPending = true; confirmOpen();
    }
    void dismiss() {
        if (!attached || closing) return;
        saveDraft(); closing = true;
        getSystemService(android.view.inputmethod.InputMethodManager.class).hideSoftInputFromWindow(root.getWindowToken(), 0);
        if (!android.animation.ValueAnimator.areAnimatorsEnabled()) { dispose(); return; }
        composer.animate().cancel();
        composer.animate().alpha(0f).translationY(dp(16)).setDuration(150).start();
        preview.expandToScreen(() -> { if (closing) dispose(); });
    }
    void dispose() {
        if (!attached) return;
        saveDraft(); attached = false; closing = false;
        composer.animate().cancel(); preview.animate().cancel();
        if (android.os.Build.VERSION.SDK_INT >= 33 && backDispatcher != null) backDispatcher.unregisterOnBackInvokedCallback(backCallback);
        getSystemService(android.view.inputmethod.InputMethodManager.class).hideSoftInputFromWindow(root.getWindowToken(), 0);
        windows.removeViewImmediate(root);
        onDismiss.accept(handoff);
    }
    boolean isClosing() { return closing; }
    int annotationCount() { return preview.annotationCount(); }
    void setAnnotations(java.util.List<ScreenAnnotation> items) { preview.setAnnotations(items); }
    private SharedPreferences getPreferences(int mode) { return getSharedPreferences("avenire-ava-draft", mode); }
    private void saveDraft() {
        if (input != null) getPreferences(MODE_PRIVATE).edit().putString("eventId", eventId).putString("draft", input.getText().toString()).apply();
    }
    private void showPrompt(Intent intent, boolean animate) {
        eventId = intent.getStringExtra("eventId");
        if (eventId == null) eventId = "manual";
        mode = "popover".equals(intent.getStringExtra("mode")) ? "popover" : "dock";
        String draft = eventId.equals(getPreferences(MODE_PRIVATE).getString("eventId", "")) ? getPreferences(MODE_PRIVATE).getString("draft", "") : "";
        LinearLayout root = new LinearLayout(this) {
            @Override public void onWindowFocusChanged(boolean focused) {
                super.onWindowFocusChanged(focused);
                if (focused) confirmOpen();
                else if (attached && !closing) service.leaveScreen();
            }
            @Override public boolean dispatchKeyEvent(android.view.KeyEvent event) {
                if (event.getKeyCode() == android.view.KeyEvent.KEYCODE_BACK) {
                    if (event.getAction() == android.view.KeyEvent.ACTION_UP) dismiss();
                    return true;
                }
                return super.dispatchKeyEvent(event);
            }
        };
        this.root = root;
        root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.BOTTOM);
        root.setBackgroundColor(android.graphics.Color.BLACK);
        root.setClipChildren(false); root.setClipToPadding(false);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime());
            view.setPadding(dp(24) + bars.left, bars.top + dp(12), dp(24) + bars.right, dp(12) + bars.bottom);
            return insets;
        });
        int[] gradient = {color("sky_blue"), color("sky_indigo"), color("sky_purple"), color("sky_blue")};
        boolean hasPreview = intent.getBooleanExtra("preview", false);
        ScreenPreview preview = new ScreenPreview(this, hasPreview, gradient);
        this.preview = preview;
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
        bar.addView(control("close", "Dismiss Ava", false, this::dismiss));
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
                send.setEnabled(!busy && ("popover".equals(mode) || s.toString().trim().length() > 0)); send.setAlpha(send.isEnabled() ? 1f : 0.4f);
                if (error != null) error.setVisibility(View.GONE);
            }
            @Override public void afterTextChanged(Editable value) { saveDraft(); }
        });
        input.setText(draft); send.setEnabled("popover".equals(mode) || !draft.trim().isEmpty()); send.setAlpha(send.isEnabled() ? 1f : 0.4f);
        transcript = new android.widget.ScrollView(this);
        transcript.setFillViewport(false); transcript.setVisibility(View.GONE);
        turns = new LinearLayout(this); turns.setOrientation(LinearLayout.VERTICAL);
        turns.setPadding(dp(12), dp(8), dp(12), dp(8)); transcript.addView(turns);
        root.addView(transcript, new LinearLayout.LayoutParams(-1, dp(96)));
        root.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        error = new TextView(this); error.setTypeface(geist); error.setTextColor(color("error")); error.setTextSize(12);
        error.setPadding(dp(16), dp(8), dp(16), 0); error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); error.setVisibility(View.GONE);
        root.addView(error);
        root.setFocusableInTouchMode(true);
        hapticPending = intent.getBooleanExtra("fromKey", false);
        reveal = root;
        root.post(this::confirmOpen);
        if (animate && android.animation.ValueAnimator.areAnimatorsEnabled()) {
            // Only the composer rises. The image pulls inward from the actual display bounds.
            bar.setAlpha(0f); bar.setTranslationY(dp(16));
            root.getViewTreeObserver().addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener() {
                @Override public boolean onPreDraw() {
                    root.getViewTreeObserver().removeOnPreDrawListener(this);
                    preview.revealFromScreen();
                    bar.animate().alpha(1f).translationY(0f).setDuration(200)
                        .setInterpolator(new android.view.animation.PathInterpolator(0.23f, 1f, 0.32f, 1f)).start();
                    return true;
                }
            });
        }
    }
    private void confirmOpen() {
        if (hapticPending && reveal != null && reveal.hasWindowFocus()) {
            hapticPending = false;
            reveal.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
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
    void requestCapture() {
        if (!((EssentialKeyService)getBaseContext()).screenAllowed(eventId)) {
            showError("Screen capture is unavailable or excluded by capture policy."); return;
        }
        saveDraft();
        android.util.Log.i("AvenireEssentialKey", "capture.requested eventId=" + eventId);
        // Integration hook only: never claim a file was saved or uploaded.
        android.widget.Toast.makeText(this, "Capture is not configured yet.", android.widget.Toast.LENGTH_SHORT).show();
        if (reveal != null) reveal.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
    }
    private void send() {
        if ("popover".equals(mode)) { requestCapture(); return; }
        String question = input.getText().toString().trim(); if (question.isEmpty() || busy) return;
        saveDraft();
        try {
            ((EssentialKeyService)getBaseContext()).submit(eventId, question);
            beginResponse(question);
        } catch (Exception unavailable) { showError(unavailable.getMessage()); }
    }
    void beginResponse(String question) {
            busy = true; input.setText(""); sendControl.setEnabled(false); sendControl.setAlpha(0.4f);
            getSystemService(android.view.inputmethod.InputMethodManager.class).hideSoftInputFromWindow(root.getWindowToken(), 0);
            transcript.setVisibility(View.VISIBLE);
            turns.removeAllViews(); response = addTurn("Ava", "Thinking…");
            transcript.post(() -> transcript.fullScroll(View.FOCUS_DOWN));
    }
    private TextView addTurn(String role, String text) {
        TextView line = new TextView(this); line.setTypeface(geist); line.setTextSize(14);
        line.setTextColor(color("fg")); line.setPadding(0, dp(6), 0, dp(8));
        line.setText(role + "\n" + text); line.setTextIsSelectable(true); turns.addView(line);
        while (turns.getChildCount() > 40) turns.removeViewAt(0);
        return line;
    }
    void updateResponse(String text, boolean done) {
        if (response == null) return;
        boolean bottom = !transcript.canScrollVertically(1);
        markdown.set(response, text);
        if (bottom) transcript.post(() -> transcript.fullScroll(View.FOCUS_DOWN));
        if (done) { busy = false; sendControl.setEnabled(!input.getText().toString().trim().isEmpty()); sendControl.setAlpha(sendControl.isEnabled() ? 1f : 0.4f); }
    }
}
