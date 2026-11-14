package com.thedamod.avenire.essentialkey;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;
import java.io.File;

/** Frozen foreground image, fitted above the composer; the gradient frames the image itself. */
final class ScreenPreview extends View {
    private Bitmap bitmap;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF bounds = new RectF();
    private final Path clip = new Path();
    private final int[] colors;
    ScreenPreview(Context context, boolean available, int[] colors) {
        super(context);
        this.colors = colors;
        if (available) bitmap = BitmapFactory.decodeFile(new File(context.getCacheDir(), "ava-preview.png").getPath());
        setContentDescription(bitmap != null ? "Screen preview. Image is not sent to Ava yet." : "Screen preview unavailable. You can still type a prompt.");
    }
    private float[] fullScreenTransform() {
        if (bitmap == null || getWidth() == 0 || getHeight() == 0) return null;
        float inset = 2*getResources().getDisplayMetrics().density;
        float scale = Math.min((getWidth()-2*inset)/bitmap.getWidth(), (getHeight()-2*inset)/bitmap.getHeight());
        android.graphics.Point size = new android.graphics.Point();
        getContext().getSystemService(android.hardware.display.DisplayManager.class)
            .getDisplay(android.view.Display.DEFAULT_DISPLAY).getRealSize(size);
        int[] position = new int[2];
        ((View)getParent()).getLocationOnScreen(position);
        // Use layout coordinates so interrupting an in-flight transform does not move the target.
        float centerX = position[0] + getLeft() + getWidth()/2f;
        float centerY = position[1] + getTop() + getHeight()/2f;
        return new float[]{size.x/(bitmap.getWidth()*scale), size.y/(bitmap.getHeight()*scale), size.x/2f-centerX, size.y/2f-centerY};
    }
    void revealFromScreen() {
        float[] target = fullScreenTransform();
        if (target == null) return;
        setPivotX(getWidth()/2f); setPivotY(getHeight()/2f);
        setScaleX(target[0]); setScaleY(target[1]); setTranslationX(target[2]); setTranslationY(target[3]);
        settleIntoFrame();
    }
    void settleIntoFrame() {
        animate().cancel();
        animate().scaleX(1f).scaleY(1f).translationX(0f).translationY(0f).setDuration(250)
            .setInterpolator(new android.view.animation.PathInterpolator(0.23f, 1f, 0.32f, 1f)).start();
    }
    void expandToScreen(Runnable finished) {
        float[] target = fullScreenTransform();
        if (target == null) { finished.run(); return; }
        animate().cancel();
        animate().scaleX(target[0]).scaleY(target[1]).translationX(target[2]).translationY(target[3]).setDuration(200)
            .setInterpolator(new android.view.animation.PathInterpolator(0.4f, 0f, 1f, 1f)).withEndAction(finished).start();
    }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float density = getResources().getDisplayMetrics().density;
        float inset = 2*density;
        float width = getWidth()-2*inset, height = getHeight()-2*inset;
        if (width <= 0 || height <= 0) return;
        if (bitmap == null) {
            paint.setShader(null); paint.setStyle(Paint.Style.FILL); paint.setColor(colors[0]); paint.setTextSize(13*getResources().getDisplayMetrics().scaledDensity);
            paint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("Screen preview unavailable", getWidth()/2f, getHeight()/2f, paint);
            return;
        }
        float scale = Math.min(width/bitmap.getWidth(), height/bitmap.getHeight());
        float w = bitmap.getWidth()*scale, h = bitmap.getHeight()*scale;
        bounds.set((getWidth()-w)/2f, (getHeight()-h)/2f, (getWidth()+w)/2f, (getHeight()+h)/2f);
        clip.reset(); clip.addRoundRect(bounds, 24*density, 24*density, Path.Direction.CW);
        canvas.save(); canvas.clipPath(clip);
        paint.setShader(null); paint.setStyle(Paint.Style.FILL);
        canvas.drawBitmap(bitmap, null, bounds, paint); canvas.restore();
        paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(3f*density);
        paint.setShader(new LinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom, colors, null, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(bounds, 24*density, 24*density, paint);
    }
    @Override protected void onDetachedFromWindow() { if (bitmap != null) { bitmap.recycle(); bitmap = null; } super.onDetachedFromWindow(); }
}
