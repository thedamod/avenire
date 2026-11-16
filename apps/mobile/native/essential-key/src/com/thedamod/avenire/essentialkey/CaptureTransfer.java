package com.thedamod.avenire.essentialkey;

import android.content.Context;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;

/** Streams only an owner-bound outbox original. No caller-supplied path is accepted. */
final class CaptureTransfer {
    private static final ConcurrentHashMap<String,HttpURLConnection> active=new ConcurrentHashMap<>();
    static void cancel(String id) { HttpURLConnection connection=active.remove(id); if(connection!=null) connection.disconnect(); }
    static JSONObject send(Context c,String id,String owner,String target,String method,JSONObject headers,JSONObject fields,String applicationOrigin) throws Exception {
        JSONObject row=CaptureStore.get(c,id,owner);
        if(!owner.equals(CaptureStore.owner(c)) || row.optBoolean("undo")) throw new IOException("Capture was cancelled or its account changed.");
        URL url=new URL(target); URI uri=url.toURI();
        if(!java.util.Arrays.asList("http","https").contains(url.getProtocol()) || uri.getUserInfo()!=null || uri.getFragment()!=null || !java.util.Arrays.asList("PUT","POST").contains(method)) throw new IOException("Invalid upload destination.");
        String origin=url.getProtocol()+"://"+url.getAuthority(); boolean application=origin.equals(applicationOrigin);
        if(!application && !url.getProtocol().equals("https")) throw new IOException("Storage uploads require HTTPS.");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(20000); connection.setReadTimeout(90000); connection.setRequestMethod(method); connection.setDoOutput(true);
        active.put(id,connection);
        try {
            for(java.util.Iterator<String> keys=headers.keys();keys.hasNext();) { String key=keys.next(); if(!application && (key.equalsIgnoreCase("cookie") || key.equalsIgnoreCase("authorization"))) continue; connection.setRequestProperty(key,headers.getString(key)); }
            File file=CaptureStore.bytes(c,id); byte[] prefix=new byte[0],suffix=new byte[0];
            if(method.equals("POST")) {
                String boundary="avenire-"+java.util.UUID.randomUUID(); StringBuilder form=new StringBuilder();
                for(java.util.Iterator<String> keys=fields.keys();keys.hasNext();) { String key=keys.next(); if(key.matches(".*[\\r\\n\"].*")) throw new IOException("Invalid form field."); form.append("--").append(boundary).append("\r\nContent-Disposition: form-data; name=\"").append(key).append("\"\r\n\r\n").append(fields.getString(key)).append("\r\n"); }
                form.append("--").append(boundary).append("\r\nContent-Disposition: form-data; name=\"file\"; filename=\"").append(id).append("\"\r\nContent-Type: ").append(row.getString("mimeType")).append("\r\n\r\n");
                prefix=form.toString().getBytes(StandardCharsets.UTF_8); suffix=("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8);
                connection.setRequestProperty("Content-Type","multipart/form-data; boundary="+boundary);
            }
            connection.setFixedLengthStreamingMode(prefix.length+file.length()+suffix.length);
            try(OutputStream output=connection.getOutputStream(); InputStream input=new FileInputStream(file)) {
                output.write(prefix); byte[] buffer=new byte[65536]; int count,loaded=0; long last=0;
                while((count=input.read(buffer))!=-1) {
                    if(!owner.equals(CaptureStore.owner(c)) || CaptureStore.get(c,id,owner).optBoolean("undo")) throw new IOException("Capture cancelled.");
                    output.write(buffer,0,count); loaded+=count;
                    long now=android.os.SystemClock.elapsedRealtime(); if(now-last>150) { last=now; EssentialKeyService service=EssentialKeyService.live; if(service!=null) service.captureProgress(id,loaded,(int)file.length()); }
                }
                output.write(suffix);
            }
            int status=connection.getResponseCode(); InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
            ByteArrayOutputStream response=new ByteArrayOutputStream();
            if(stream!=null) try(InputStream input=stream) { byte[] bytes=new byte[4096]; int count; while((count=input.read(bytes))!=-1) { if(response.size()+count>65536) throw new IOException("Upload response exceeded its limit."); response.write(bytes,0,count); } }
            return new JSONObject().put("status",status).put("text",response.toString("UTF-8"));
        } finally { active.remove(id,connection); connection.disconnect(); }
    }
}
