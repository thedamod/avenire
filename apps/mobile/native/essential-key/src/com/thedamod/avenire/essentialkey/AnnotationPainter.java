package com.thedamod.avenire.essentialkey;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import java.util.List;

/** Passive Qt-style shapes and readable plain-text bubbles mapped to the actual image rectangle. */
final class AnnotationPainter {
    static void draw(Canvas canvas, RectF image, List<ScreenAnnotation> items, float dp, float sp, Typeface font, int accent) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG); paint.setStrokeWidth(2*dp); paint.setStrokeCap(Paint.Cap.ROUND);
        for (ScreenAnnotation item : items) {
            int color = accent;
            if (!item.color.isEmpty()) {
                String hex = item.color.length() == 9 ? "#" + item.color.substring(7, 9) + item.color.substring(1, 7) : item.color;
                color = Color.parseColor(hex); // Contract uses #RRGGBBAA; Android expects #AARRGGBB.
            }
            float x = image.left + item.x*image.width(), y = image.top + item.y*image.height();
            float endX = Math.min(image.right, x + item.width*image.width());
            float endY = Math.min(image.bottom, y + item.height*image.height());
            paint.setStyle(Paint.Style.STROKE); paint.setColor(color);
            if (item.kind.equals("rect")) canvas.drawRoundRect(x, y, endX, endY, 4*dp, 4*dp, paint);
            else if (item.kind.equals("cursor")) { paint.setStyle(Paint.Style.FILL); canvas.drawCircle(x, y, 4*dp, paint); }
            else if (item.kind.equals("arrow")) {
                canvas.drawLine(x, y, endX, endY, paint);
                double angle = Math.atan2(endY-y, endX-x);
                float length = 9*dp;
                for (double offset : new double[]{-0.55, 0.55}) canvas.drawLine(endX, endY, endX-length*(float)Math.cos(angle+offset), endY-length*(float)Math.sin(angle+offset), paint);
            }
            if (item.text.isEmpty()) continue;
            int width = Math.max(1, Math.round(Math.min(224*dp, image.width()-24*dp)));
            TextPaint text = new TextPaint(Paint.ANTI_ALIAS_FLAG); text.setTypeface(font); text.setTextSize(14*sp); text.setColor(Color.rgb(237, 237, 237));
            StaticLayout layout = StaticLayout.Builder.obtain(item.text, 0, item.text.length(), text, width)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).setMaxLines(5).setEllipsize(TextUtils.TruncateAt.END).build();
            float boxW = width+24*dp, boxH = layout.getHeight()+20*dp;
            float bx = x+14*dp+boxW <= image.right-4*dp ? x+14*dp : x-boxW-14*dp;
            bx = Math.max(image.left+4*dp, Math.min(image.right-boxW-4*dp, bx));
            float by = Math.max(image.top+4*dp, Math.min(image.bottom-boxH-4*dp, y+12*dp));
            paint.setColor(color); paint.setStyle(Paint.Style.STROKE);
            canvas.drawLine(x, y, Math.max(bx, Math.min(bx+boxW, x)), Math.max(by, Math.min(by+boxH, y)), paint);
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.argb(246, 28, 28, 28));
            canvas.drawRoundRect(bx, by, bx+boxW, by+boxH, 10*dp, 10*dp, paint);
            paint.setStyle(Paint.Style.STROKE); paint.setColor(color); paint.setStrokeWidth(dp);
            canvas.drawRoundRect(bx, by, bx+boxW, by+boxH, 10*dp, 10*dp, paint); paint.setStrokeWidth(2*dp);
            canvas.save(); canvas.translate(bx+12*dp, by+10*dp); layout.draw(canvas); canvas.restore();
        }
    }
}
