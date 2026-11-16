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
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import java.io.File;

/** Frozen foreground image, fitted above the composer; the gradient frames the image itself. */
final class ScreenPreview extends View {
    private static final String UNAVAILABLE = "Screen capture can’t access private windows or protected screens.";
    private final TextPaint emptyText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private StaticLayout emptyLayout;
    private int emptyWidth;
    private float emptyTextSize;
    private Bitmap bitmap;
    private java.util.List<ScreenAnnotation> annotations = java.util.Collections.emptyList();
    int annotationCount() { return annotations.size(); }
    void setAnnotations(java.util.List<ScreenAnnotation> items) {
        annotations = items;
        StringBuilder description = new StringBuilder("Screen preview");
        for (ScreenAnnotation item : items) if (!item.text.isEmpty()) description.append(". ").append(item.text);
        setContentDescription(description.toString()); invalidate();
    }
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF bounds = new RectF();
    private final Path clip = new Path();
    private final int[] colors;
    private final android.graphics.Typeface font;
    ScreenPreview(Context context, boolean available, int[] colors) {
        super(context);
        this.colors = colors;
        font = getResources().getFont(getResources().getIdentifier("avenire_geist", "font", getContext().getPackageName()));
        if (available) bitmap = BitmapFactory.decodeFile(new File(context.getCacheDir(), "ava-preview.png").getPath());
        setContentDescription(bitmap != null ? "Screen preview. Only submitted Ava questions can share this image when screen sharing is enabled." : UNAVAILABLE + " You can still ask Ava.");
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
            float scaledDensity = getResources().getDisplayMetrics().scaledDensity;
            int textWidth = Math.max(1, Math.round(Math.min(width - 40*density, 290*density)));
            float textSize = 15*scaledDensity;
            if (emptyLayout == null || emptyWidth != textWidth || emptyTextSize != textSize) {
                emptyText.setTypeface(font); emptyText.setTextSize(textSize); emptyText.setColor(0xFFB8B8B8);
                emptyLayout = StaticLayout.Builder.obtain(UNAVAILABLE, 0, UNAVAILABLE.length(), emptyText, textWidth)
                    .setAlignment(Layout.Alignment.ALIGN_CENTER).setIncludePad(false).setLineSpacing(3*density, 1f).build();
                emptyWidth = textWidth; emptyTextSize = textSize;
            }
            float iconSize = 32*density;
            float gap = 18*density;
            float helperHeight = 18*scaledDensity;
            float total = iconSize + gap + emptyLayout.getHeight() + 12*density + helperHeight;
            float top = Math.max(12*density, (getHeight()-total)/2f);
            float center = getWidth()/2f;
            // A shield with a keyhole makes the restriction understandable without relying on color.
            canvas.save(); canvas.translate(center-iconSize/2f, top); canvas.scale(iconSize/32f, iconSize/32f);
            paint.setShader(null); paint.setStyle(Paint.Style.STROKE); paint.setColor(0xFF9A9A9A);
            paint.setStrokeWidth(1.6f); paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
            clip.reset(); clip.moveTo(16, 3); clip.lineTo(27, 7); clip.lineTo(27, 15);
            clip.cubicTo(27, 22, 22, 27, 16, 30); clip.cubicTo(10, 27, 5, 22, 5, 15);
            clip.lineTo(5, 7); clip.close(); canvas.drawPath(clip, paint);
            canvas.drawCircle(16, 14, 2.5f, paint); canvas.drawLine(16, 16.5f, 16, 21, paint);
            canvas.restore();
            canvas.save(); canvas.translate(center-textWidth/2f, top+iconSize+gap); emptyLayout.draw(canvas); canvas.restore();
            paint.setStyle(Paint.Style.FILL); paint.setTypeface(font); paint.setTextSize(13*scaledDensity);
            paint.setColor(0xFF777777); paint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("You can still ask Ava", center, top+total-paint.descent(), paint);
            return;
        }
        float scale = Math.min(width/bitmap.getWidth(), height/bitmap.getHeight());
        float w = bitmap.getWidth()*scale, h = bitmap.getHeight()*scale;
        bounds.set((getWidth()-w)/2f, (getHeight()-h)/2f, (getWidth()+w)/2f, (getHeight()+h)/2f);
        clip.reset(); clip.addRoundRect(bounds, 24*density, 24*density, Path.Direction.CW);
        canvas.save(); canvas.clipPath(clip);
        paint.setShader(null); paint.setStyle(Paint.Style.FILL);
        canvas.drawBitmap(bitmap, null, bounds, paint);
        AnnotationPainter.draw(canvas, bounds, annotations, density, getResources().getDisplayMetrics().scaledDensity, font, colors[0]);
        canvas.restore();
        paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(3f*density);
        paint.setShader(new LinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom, colors, null, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(bounds, 24*density, 24*density, paint);
    }
    @Override protected void onDetachedFromWindow() { if (bitmap != null) { bitmap.recycle(); bitmap = null; } super.onDetachedFromWindow(); }
}
