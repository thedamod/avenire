package com.thedamod.avenire.essentialkey;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** A launcher widget is a text-only entry, never a way to inspect the previously open app. */
public final class AvaWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews view = new RemoteViews(context.getPackageName(), context.getResources().getIdentifier("ava_widget", "layout", context.getPackageName()));
            Intent open = new Intent(context, AvaEntryActivity.class).setAction("com.thedamod.avenire.AVA_WIDGET");
            PendingIntent action = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            view.setOnClickPendingIntent(context.getResources().getIdentifier("ava_widget_button", "id", context.getPackageName()), action);
            manager.updateAppWidget(id, view);
        }
    }
}
