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
import java.util.ArrayList;
import java.util.List;

/** Target anchors stay exact; compact callouts are packed independently and connected by arrows. */
final class AnnotationPainter {
    private static final class Bubble {
        final AnnotationLayout.Box box;
        final StaticLayout text;
        final float x,y;
        final int color;
        Bubble(AnnotationLayout.Box box, StaticLayout text, float x, float y, int color) {
            this.box=box; this.text=text; this.x=x; this.y=y; this.color=color;
        }
    }
    private static int color(ScreenAnnotation item, int accent) {
        if (item.color.isEmpty()) return accent;
        String hex = item.color.length()==9 ? "#"+item.color.substring(7,9)+item.color.substring(1,7) : item.color;
        return Color.parseColor(hex);
    }
    private static void arrow(Canvas canvas, float x, float y, float targetX, float targetY, float dp, Paint paint) {
        paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1.5f*dp);
        canvas.drawLine(x,y,targetX,targetY,paint);
        double angle=Math.atan2(targetY-y,targetX-x);
        for (double offset : new double[]{-0.5,0.5}) canvas.drawLine(targetX,targetY,targetX-8*dp*(float)Math.cos(angle+offset),targetY-8*dp*(float)Math.sin(angle+offset),paint);
    }
    static void draw(Canvas canvas, RectF image, List<ScreenAnnotation> items, float dp, float sp, Typeface font, int accent) {
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG); paint.setStrokeCap(Paint.Cap.ROUND);
        List<float[]> targets=new ArrayList<>();
        for (ScreenAnnotation item: items) {
            targets.add(new float[]{image.left+item.x*image.width(),image.top+item.y*image.height()});
            if (item.kind.equals("arrow")) targets.add(new float[]{image.left+Math.min(1,item.x+item.width)*image.width(),image.top+Math.min(1,item.y+item.height)*image.height()});
            if (item.kind.equals("rect")) targets.add(new float[]{image.left+Math.min(1,item.x+item.width/2)*image.width(),image.top+Math.min(1,item.y+item.height/2)*image.height()});
        }
        List<AnnotationLayout.Box> occupied=new ArrayList<>();
        List<Bubble> bubbles=new ArrayList<>();
        AnnotationLayout.Box area=new AnnotationLayout.Box(image.left+8*dp,image.top+8*dp,image.width()-16*dp,image.height()-16*dp);
        TextPaint ink=new TextPaint(Paint.ANTI_ALIAS_FLAG); ink.setTypeface(font); ink.setTextSize(14*sp); ink.setColor(Color.rgb(237,237,237));
        for (ScreenAnnotation item: items) {
            int color=color(item,accent); paint.setColor(color); paint.setStrokeWidth(2*dp); paint.setStyle(Paint.Style.STROKE);
            float x=image.left+item.x*image.width(),y=image.top+item.y*image.height();
            float endX=Math.min(image.right,x+item.width*image.width()),endY=Math.min(image.bottom,y+item.height*image.height());
            if (item.kind.equals("rect")) canvas.drawRoundRect(x,y,endX,endY,4*dp,4*dp,paint);
            else if (item.kind.equals("cursor")) { paint.setStyle(Paint.Style.FILL); canvas.drawCircle(x,y,4*dp,paint); }
            else if (item.kind.equals("arrow")) arrow(canvas,x,y,endX,endY,dp,paint);
            if (item.text.isEmpty()) continue;
            int maxWidth=Math.max(1,Math.round(Math.min(188*dp,area.width-24*dp)));
            int textWidth=Math.max(1,Math.min(maxWidth,(int)Math.ceil(Layout.getDesiredWidth(item.text,ink))));
            StaticLayout text=StaticLayout.Builder.obtain(item.text,0,item.text.length(),ink,textWidth)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).setMaxLines(4).setEllipsize(TextUtils.TruncateAt.END).build();
            Float labelX=item.labelX==null ? null : image.left+item.labelX*image.width();
            Float labelY=item.labelY==null ? null : image.top+item.labelY*image.height();
            AnnotationLayout.Box box=AnnotationLayout.place(area,textWidth+24*dp,text.getHeight()+20*dp,x,y,labelX,labelY,occupied,targets,8*dp);
            if (box==null) continue;
            occupied.add(box); bubbles.add(new Bubble(box,text,x,y,color));
        }
        // Leaders go behind every callout so they never draw over another label's text.
        for (Bubble bubble: bubbles) {
            AnnotationLayout.Box b=bubble.box;
            float fromX=Math.max(b.x,Math.min(b.x+b.width,bubble.x)),fromY=Math.max(b.y,Math.min(b.y+b.height,bubble.y));
            paint.setColor(bubble.color); arrow(canvas,fromX,fromY,bubble.x,bubble.y,dp,paint);
        }
        for (Bubble bubble: bubbles) {
            AnnotationLayout.Box b=bubble.box;
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.argb(246,28,28,28));
            canvas.drawRoundRect(b.x,b.y,b.x+b.width,b.y+b.height,10*dp,10*dp,paint);
            paint.setStyle(Paint.Style.STROKE); paint.setColor(bubble.color); paint.setStrokeWidth(dp);
            canvas.drawRoundRect(b.x,b.y,b.x+b.width,b.y+b.height,10*dp,10*dp,paint);
            canvas.save();canvas.translate(b.x+12*dp,b.y+10*dp);bubble.text.draw(canvas);canvas.restore();
        }
    }
}
