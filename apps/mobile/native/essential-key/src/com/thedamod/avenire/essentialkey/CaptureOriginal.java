package com.thedamod.avenire.essentialkey;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import org.json.JSONObject;

/** Anonymous original acquisition. Every redirect is policy checked before opening it. */
final class CaptureOriginal {
    private static URL allowed(String raw) throws Exception {
        if(!AndroidScreenPolicy.permitsUrl(raw)) throw new IOException("This URL is excluded by capture policy.");
        URL url=new URL(raw);
        for(InetAddress address:InetAddress.getAllByName(url.getHost()))
            if(address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress())
                throw new IOException("Private-network originals must be shared from their app.");
        return url;
    }
    static JSONObject acquire(Context context,String id,String owner,String source) throws Exception {
        JSONObject row=CaptureStore.get(context,id,owner);
        if(!row.has("acquisitionUrl") && (!row.getJSONObject("origin").optString("_tag").equals("Screen") || !row.getJSONObject("origin").has("url"))) return row;
        if(!owner.equals(CaptureStore.owner(context)) || row.optBoolean("undo")) throw new IOException("Capture cancelled.");
        long deadline=android.os.SystemClock.elapsedRealtime()+60000;
        URL url=allowed(source); File temporary=new File(CaptureStore.bytes(context,id).getParentFile(),id+".download");
        boolean driveLink=url.getHost().equalsIgnoreCase("drive.google.com") || url.getHost().equalsIgnoreCase("docs.google.com");
        try {
            for(int redirects=0;redirects<=5;redirects++) {
                if(android.os.SystemClock.elapsedRealtime()>deadline) throw new IOException("Original acquisition timed out. Retry or share it from the app.");
                HttpURLConnection connection=(HttpURLConnection)url.openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
                connection.setRequestProperty("User-Agent","Avenire/1.0 (explicit original capture)");
                try {
                    int status=connection.getResponseCode();
                    if(status>=300 && status<400) {
                        String location=connection.getHeaderField("Location");
                        if(location==null || redirects==5) throw new IOException("Original redirect limit exceeded.");
                        url=allowed(new URL(url,location).toExternalForm()); continue;
                    }
                    if(status<200 || status>=300) throw new IOException("Original unavailable (HTTP "+status+"). Use the app's Share option for authenticated documents.");
                    if(connection.getContentLengthLong()>CaptureStore.MAX_BYTES) throw new IOException("Original exceeds the 32 MB capture limit.");
                    String mime=connection.getContentType(); mime=mime==null?"":mime.split(";",2)[0].trim().toLowerCase(java.util.Locale.ROOT);
                    if(row.optBoolean("requireMedia") && !mime.startsWith("audio/") && !mime.startsWith("video/")) throw new IOException("The player provided a webpage link, not the audio/video original. Share the media file itself.");
                    MessageDigest digest=MessageDigest.getInstance("SHA-256"); long size=0; byte[] first=null;
                    try(InputStream input=connection.getInputStream(); FileOutputStream output=new FileOutputStream(temporary)) {
                        byte[] buffer=new byte[65536]; int count;
                        while((count=input.read(buffer))!=-1) {
                            if(android.os.SystemClock.elapsedRealtime()>deadline) throw new IOException("Original acquisition timed out. Retry or share it from the app.");
                            if(!owner.equals(CaptureStore.owner(context)) || CaptureStore.get(context,id,owner).optBoolean("undo")) throw new IOException("Capture cancelled.");
                            if(first==null) first=java.util.Arrays.copyOf(buffer,Math.min(count,512));
                            size+=count; if(size>CaptureStore.MAX_BYTES) throw new IOException("Original exceeds the 32 MB capture limit.");
                            output.write(buffer,0,count); digest.update(buffer,0,count);
                        }
                        output.getFD().sync();
                    }
                    if(size==0) throw new IOException("The original is empty.");
                    String head=first==null?"":new String(first,java.nio.charset.StandardCharsets.UTF_8).trim().toLowerCase(java.util.Locale.ROOT);
                    if(head.startsWith("%pdf-")) mime="application/pdf";
                    else if(mime.equals("text/html") || mime.equals("application/xhtml+xml") || head.startsWith("<!doctype html") || head.startsWith("<html")) mime="text/html";
                    else if(!mime.startsWith("audio/") && !mime.startsWith("video/") && !mime.startsWith("image/") && !mime.startsWith("text/") && !mime.matches("application/(?:vnd\\.openxmlformats-officedocument\\..*|vnd\\.oasis\\.opendocument\\..*|msword|vnd\\.ms-excel|vnd\\.ms-powerpoint|rtf|json)")) throw new IOException("This URL did not provide an original document or media file. Share the original from its app.");
                    if(driveLink && mime.equals("text/html")) throw new IOException("Drive provided a webpage link, not its original file. Open the file in Drive's viewer and double-press, or use Send a copy → Avenire.");
                    StringBuilder hash=new StringBuilder(); for(byte b:digest.digest()) hash.append(String.format(java.util.Locale.ROOT,"%02x",b & 255));
                    return CaptureStore.original(context,id,owner,temporary,url.toExternalForm(),mime,hash.toString(),size);
                } finally { connection.disconnect(); }
            }
            throw new IOException("Original could not be acquired.");
        } finally { temporary.delete(); }
    }
}
