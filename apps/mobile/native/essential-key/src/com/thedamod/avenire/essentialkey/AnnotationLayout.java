package com.thedamod.avenire.essentialkey;

import java.util.ArrayList;
import java.util.List;

/** Deterministic callout packing, independent of device/platform drawing APIs. */
final class AnnotationLayout {
    static final class Box {
        final float x, y, width, height;
        Box(float x, float y, float width, float height) { this.x=x; this.y=y; this.width=width; this.height=height; }
        boolean overlaps(Box b, float gap) { return x < b.x+b.width+gap && x+width+gap > b.x && y < b.y+b.height+gap && y+height+gap > b.y; }
        boolean contains(float px, float py, float gap) { return px >= x-gap && px <= x+width+gap && py >= y-gap && py <= y+height+gap; }
    }
    static Box place(Box area, float width, float height, float anchorX, float anchorY, Float labelX, Float labelY, List<Box> occupied, List<float[]> targets, float gap) {
        if (width > area.width || height > area.height) return null;
        float preferredX = labelX == null ? anchorX+gap*2 : labelX;
        float preferredY = labelY == null ? anchorY+gap*2 : labelY;
        List<Float> xs = new ArrayList<>(), ys = new ArrayList<>();
        xs.add(preferredX); ys.add(preferredY);
        xs.add(area.x); xs.add(area.x+area.width-width);
        ys.add(area.y); ys.add(area.y+area.height-height);
        xs.add(anchorX-width-gap*2); ys.add(anchorY-height-gap*2);
        for (Box box : occupied) {
            xs.add(box.x+box.width+gap); xs.add(box.x-width-gap);
            ys.add(box.y+box.height+gap); ys.add(box.y-height-gap);
        }
        for (float y=area.y; y<=area.y+area.height-height; y+=height+gap) ys.add(y);
        Box best=null; float bestScore=Float.POSITIVE_INFINITY;
        for (float cx : xs) for (float cy : ys) {
            Box candidate = new Box(Math.max(area.x, Math.min(area.x+area.width-width,cx)),Math.max(area.y,Math.min(area.y+area.height-height,cy)),width,height);
            boolean blocked=false;
            for (Box box : occupied) if (candidate.overlaps(box,gap)) { blocked=true; break; }
            if (blocked) continue;
            for (float[] target : targets) if (candidate.contains(target[0],target[1],gap)) { blocked=true; break; }
            if (blocked) continue;
            float dx=candidate.x-preferredX, dy=candidate.y-preferredY;
            float score=dx*dx+dy*dy;
            if (score < bestScore) { best=candidate; bestScore=score; }
        }
        return best; // If crowded beyond capacity, omit a bubble rather than overlap another.
    }
}
