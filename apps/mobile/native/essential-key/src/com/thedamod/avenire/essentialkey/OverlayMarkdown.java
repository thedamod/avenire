package com.thedamod.avenire.essentialkey;

import android.content.Context;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.Spanned;
import android.text.SpannableStringBuilder;
import android.widget.TextView;
import io.noties.markwon.Markwon;
import io.noties.markwon.AbstractMarkwonPlugin;
import io.noties.markwon.MarkwonConfiguration;
import io.noties.markwon.core.MarkwonTheme;

/** Native CommonMark spans: selectable text, theme fonts and explicit web-link navigation. */
final class OverlayMarkdown {
    private final Markwon markwon;
    private Runnable onOpenLink=() -> {};
    void onOpenLink(Runnable callback) { onOpenLink=callback; }
    OverlayMarkdown(Context context, int accent, int foreground, int surface) {
        int monoId=context.getResources().getIdentifier("avenire_geist_mono","font",context.getPackageName());
        Typeface mono=monoId==0 ? Typeface.MONOSPACE : context.getResources().getFont(monoId);
        markwon=Markwon.builder(context).usePlugin(new AbstractMarkwonPlugin() {
            @Override public void configureTheme(MarkwonTheme.Builder builder) {
                builder.linkColor(accent).codeTypeface(mono).codeBlockTypeface(mono)
                    .codeTextColor(foreground).codeBlockTextColor(foreground)
                    .codeBackgroundColor(surface).codeBlockBackgroundColor(surface)
                    .blockQuoteColor(accent).blockMargin(Math.round(6*context.getResources().getDisplayMetrics().density))
                    .headingBreakHeight(0).headingTextSizeMultipliers(new float[]{1.3f,1.2f,1.1f,1f,1f,1f});
            }
            @Override public void configureConfiguration(MarkwonConfiguration.Builder builder) {
                builder.linkResolver((view, link) -> {
                    if (!allowedLink(link)) return;
                    try { context.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); onOpenLink.run(); }
                    catch (ActivityNotFoundException unavailable) { android.widget.Toast.makeText(context,"No app can open this link.",android.widget.Toast.LENGTH_SHORT).show(); }
                });
            }
        }).build();
    }
    static boolean allowedLink(String link) {
        Uri uri=Uri.parse(link);
        return ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) && uri.getHost()!=null && !uri.getHost().isEmpty();
    }
    Spanned render(String text) { return markwon.toMarkdown(text); }
    void set(TextView view, String text) {
        SpannableStringBuilder content=new SpannableStringBuilder("Ava\n"); content.append(render(text));
        markwon.setParsedMarkdown(view,content);
        view.setMovementMethod(android.text.method.LinkMovementMethod.getInstance());
    }
}
