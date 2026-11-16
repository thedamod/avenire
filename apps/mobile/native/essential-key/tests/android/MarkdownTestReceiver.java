package com.thedamod.avenire.essentialkey;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.text.Spanned;
import android.widget.TextView;

/** Probe-only Android span tests; does not enable accessibility or open a UI. */
public final class MarkdownTestReceiver extends BroadcastReceiver {
    private static void check(boolean value,String message) { if(!value) throw new AssertionError(message); }
    private static boolean span(Spanned text,String name) {
        for(Object item:text.getSpans(0,text.length(),Object.class)) if(item.getClass().getSimpleName().equals(name)) return true;
        return false;
    }
    @Override public void onReceive(Context context,Intent intent) {
        try {
            OverlayMarkdown markdown=new OverlayMarkdown(context,0xFFABC4FF,0xFFEDEDED,0xFF161616);
            Spanned inline=markdown.render("**Bold** and *italic* with `code` and [link](https://example.com)");
            check(inline.toString().replace('\u00a0',' ').replaceAll(" +"," ").trim().equals("Bold and italic with code and link"),"Unexpected rendered inline text: "+inline);
            for(String name:new String[]{"StrongEmphasisSpan","EmphasisSpan","CodeSpan","LinkSpan"}) check(span(inline,name),"Missing "+name);
            Spanned blocks=markdown.render("# Heading\n\n- First\n- Second\n\n> Quote\n\n```java\nint x=1;\n```");
            for(String name:new String[]{"HeadingSpan","BulletListItemSpan","BlockQuoteSpan","CodeBlockSpan"}) check(span(blocks,name),"Missing "+name);
            check(span(markdown.render("1. First\n2. Second"),"OrderedListItemSpan"),"Numbered list missing");
            check(OverlayMarkdown.allowedLink("https://example.com") && OverlayMarkdown.allowedLink("http://example.com"),"Web links rejected");
            for(String link:new String[]{"javascript:alert(1)","file:///data/private","intent://x","avenire://ask","https:"}) check(!OverlayMarkdown.allowedLink(link),"Unsafe scheme accepted");
            TextView view=new TextView(context);markdown.set(view,"**Answer** with `code`.");
            check(view.getText().toString().replace('\u00a0',' ').replaceAll(" +"," ").equals("Ava\nAnswer with code ."),"Unexpected rendered TextView text: "+view.getText());
            check(view.getText() instanceof Spanned && span((Spanned)view.getText(),"StrongEmphasisSpan"),"TextView lost formatting");
            setResultCode(-1);setResultData("Markdown passed: emphasis, code, headings, lists, quotes, links and native TextView spans.");
        } catch(Throwable error) {setResultCode(0);setResultData("Markdown test failed: "+error);}
    }
}
