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
    void revealFromScreen() {
        if (bitmap == null || getWidth() == 0 || getHeight() == 0) return;
        float inset = 2*getResources().getDisplayMetrics().density;
        float scale = Math.min((getWidth()-2*inset)/bitmap.getWidth(), (getHeight()-2*inset)/bitmap.getHeight());
        float frameWidth = bitmap.getWidth()*scale, frameHeight = bitmap.getHeight()*scale;
        android.graphics.Rect screen = ((android.app.Activity)getContext()).getWindowManager().getCurrentWindowMetrics().getBounds();
        int[] position = new int[2]; getLocationOnScreen(position);
        // The first frame is exactly the original display rectangle, not a dock-like slide.
        setPivotX(getWidth()/2f); setPivotY(getHeight()/2f);
        setScaleX(screen.width()/frameWidth); setScaleY(screen.height()/frameHeight);
        setTranslationX(screen.exactCenterX() - position[0] - getWidth()/2f);
        setTranslationY(screen.exactCenterY() - position[1] - getHeight()/2f);
        animate().scaleX(1f).scaleY(1f).translationX(0f).translationY(0f).setDuration(250)
            .setInterpolator(new android.view.animation.PathInterpolator(0.23f, 1f, 0.32f, 1f)).start();
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
        paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1.5f*density);
        paint.setShader(new LinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom, colors, null, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(bounds, 24*density, 24*density, paint);
    }
    @Override protected void onDetachedFromWindow() { if (bitmap != null) { bitmap.recycle(); bitmap = null; } super.onDetachedFromWindow(); }
}
