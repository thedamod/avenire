package com.thedamod.avenire.essentialkey;
import java.util.*;
public final class AnnotationLayoutTest {
    static void check(boolean value,String message) { if(!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        AnnotationLayout.Box area=new AnnotationLayout.Box(0,0,320,640);
        List<AnnotationLayout.Box> occupied=new ArrayList<>();
        List<float[]> targets=Arrays.asList(new float[]{150,300},new float[]{155,305},new float[]{160,310});
        for(int i=0;i<8;i++) {
            AnnotationLayout.Box b=AnnotationLayout.place(area,150,55,150+i,300+i,20f,280f,occupied,targets,8);
            check(b!=null,"Clustered callouts did not find free space");
            check(b.x>=0 && b.y>=0 && b.x+b.width<=320 && b.y+b.height<=640,"Callout left image bounds");
            for(AnnotationLayout.Box other:occupied)check(!b.overlaps(other,8),"Callouts overlap");
            for(float[] target:targets)check(!b.contains(target[0],target[1],8),"Callout obscures a target");
            occupied.add(b);
        }
        AnnotationLayout.Box distant=AnnotationLayout.place(area,120,40,150,350,10f,20f,new ArrayList<>(),targets,8);
        check(distant.x==10 && distant.y==20,"Explicit distant label position was ignored");
        AnnotationLayout.Box full=new AnnotationLayout.Box(0,0,100,100);
        check(AnnotationLayout.place(full,100,100,150,150,null,null,Arrays.asList(full),new ArrayList<>(),8)==null,"Full layout must omit instead of overlap");
        System.out.println("Annotation packing passed: clustered targets, gap, bounds, distant callouts and full-capacity handling.");
    }
}
