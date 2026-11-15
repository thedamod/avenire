package com.thedamod.avenire.essentialkey;

import android.content.Context;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.*;
import java.time.Instant;
import org.json.JSONObject;

/** Shared ingestion of a framework-granted original. No filesystem paths or UI scraping. */
final class CaptureSources {
    static String kind(String mime) { return mime.equals("application/pdf")?"pdf":mime.startsWith("audio/")?"audio":mime.startsWith("video/")?"video":mime.startsWith("image/")?"image":(mime.equals("text/html") || mime.equals("application/xhtml+xml"))?"web-page":"document"; }
    static JSONObject stage(Context context,Uri uri,String owner,String session,String note,String hint) throws Exception {
        if(!"content".equals(uri.getScheme())) throw new IOException("The app did not provide a readable original URI.");
        android.content.pm.ProviderInfo provider=context.getPackageManager().resolveContentProvider(uri.getAuthority(),0);
        String appName=null;
        if(provider!=null) {
            String label=context.getPackageManager().getApplicationLabel(provider.applicationInfo).toString();
            appName=label;
            if(!AndroidScreenPolicy.allows(provider.packageName,label,false,false,1)) throw new IOException("This app is excluded by capture policy.");
        }
        String name="Shared original"; long size=-1;
        try(android.database.Cursor cursor=context.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)) {
            if(cursor!=null && cursor.moveToFirst()) { int n=cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME),s=cursor.getColumnIndex(OpenableColumns.SIZE); if(n>=0 && !cursor.isNull(n)) name=cursor.getString(n); if(s>=0 && !cursor.isNull(s)) size=cursor.getLong(s); }
        }
        if(size>CaptureStore.MAX_BYTES) throw new IOException("Original exceeds the 32 MB capture limit.");
        name=name.replaceAll("[\\\\/\\p{Cntrl}]","_"); if(name.isEmpty()) name="Shared original";
        name=name.substring(0,Math.min(200,name.length()));
        String mime=context.getContentResolver().getType(uri);
        if(mime==null || mime.equals("application/octet-stream")) {
            if(hint!=null && !hint.contains("*")) mime=hint;
            else { int dot=name.lastIndexOf('.'); if(dot>=0) mime=android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot+1).toLowerCase(java.util.Locale.ROOT)); }
        }
        if(mime==null) throw new IOException("The source app did not provide the original's type.");
        String exportType=null,extension=null;
        if(mime.startsWith("application/vnd.google-apps.")) {
            String office=mime.endsWith("spreadsheet")?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":mime.endsWith("presentation")?"application/vnd.openxmlformats-officedocument.presentationml.presentation":"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            for(String target:new String[]{office,"application/pdf"}) {
                String[] supported=context.getContentResolver().getStreamTypes(uri,target);
                if(supported!=null && supported.length>0) { exportType=target; break; }
            }
            if(exportType==null) throw new IOException("Drive did not grant a downloadable export. Open the file in Drive's viewer and try again, or use Send a copy → Avenire.");
            extension=exportType.equals("application/pdf")?"pdf":exportType.equals(office)?(mime.endsWith("spreadsheet")?"xlsx":mime.endsWith("presentation")?"pptx":"docx"):"bin";
            name=name.replaceAll("(?i)\\.(?:gdoc|gsheet|gslides)$","")+"."+extension;
            mime=exportType;
            if(appName!=null) appName+=" (export)";
        }
        String kind=kind(mime);
        JSONObject origin=new JSONObject().put("_tag","LocalFile").put("fileName",name).put("capturedAt",Instant.now().toString());
        if(appName!=null) origin.put("appName",appName);
        if(note!=null && !note.trim().isEmpty()) origin.put("note",note.trim().substring(0,Math.min(note.trim().length(),5000)));
        android.content.res.AssetFileDescriptor exported=null;
        try {
            InputStream input;
            if(exportType!=null) { exported=context.getContentResolver().openTypedAssetFileDescriptor(uri,exportType,null); input=exported==null?null:exported.createInputStream(); }
            else input=context.getContentResolver().openInputStream(uri);
            if(input==null) throw new IOException("The app did not grant access to its original.");
            return CaptureStore.stage(context,owner,session,input,name,mime,kind,origin);
        } finally { if(exported!=null) exported.close(); }
    }
}
