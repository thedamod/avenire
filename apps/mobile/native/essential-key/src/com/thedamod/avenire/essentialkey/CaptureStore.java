package com.thedamod.avenire.essentialkey;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;

/** App-private durable outbox. UI intents and JS never supply filesystem paths. */
final class CaptureStore {
    static final long MAX_BYTES = 32L * 1024 * 1024;
    private static File directory(Context c) { File dir = new File(c.getFilesDir(), "capture-outbox"); dir.mkdirs(); return dir; }
    private static AtomicFile journal(Context c) { return new AtomicFile(new File(directory(c), "queue.json")); }
    private static JSONArray read(Context c) throws Exception {
        if (!journal(c).getBaseFile().exists()) return new JSONArray();
        return new JSONArray(new String(journal(c).readFully(), java.nio.charset.StandardCharsets.UTF_8));
    }
    private static void write(Context c, JSONArray rows) throws Exception {
        AtomicFile file = journal(c); FileOutputStream output = null;
        try { output = file.startWrite(); output.write(rows.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); file.finishWrite(output); }
        catch (Exception error) { if (output != null) file.failWrite(output); throw error; }
    }
    static String owner(Context c) { return c.getSharedPreferences("ava-screen-session", 0).getString("owner", ""); }
    static String device(Context c) {
        android.content.SharedPreferences prefs = c.getSharedPreferences("ava-triggers", 0);
        String id = prefs.getString("deviceId", "");
        if (id.isEmpty()) { id = UUID.randomUUID().toString(); prefs.edit().putString("deviceId", id).commit(); }
        return id;
    }
    static synchronized JSONObject stage(Context c, String owner, String session, InputStream input, String title, String mime, String kind, JSONObject origin) throws Exception {
        if (owner.isEmpty()) throw new IllegalStateException("Sign in to Avenire before capturing.");
        JSONArray rows = read(c); long retained = 0; int pending = 0;
        for (int i=rows.length()-1; i>=0; i--) {
            JSONObject row = rows.getJSONObject(i);
            if (row.optString("session").equals(session) && row.getString("owner").equals(owner)) { input.close(); return row; }
            // Failed transfers keep their original until Retry/Undo, even after a day offline.
            if (System.currentTimeMillis()-row.optLong("created") > 86_400_000 && terminal(row.optString("phase")) && !bytes(c,row.getString("id")).exists()) { rows.remove(i); }
            else { File original=bytes(c,row.getString("id")); if(original.exists()) retained+=original.length(); if(original.exists() || !terminal(row.optString("phase"))) pending++; }
        }
        if (pending >= 32 || retained >= 256L*1024*1024) { input.close(); throw new IOException("Capture queue is full. Finish or undo pending captures first."); }
        String id=UUID.randomUUID().toString(); File temporary=new File(directory(c),id+".tmp");
        MessageDigest digest=MessageDigest.getInstance("SHA-256"); long size=0;
        try (InputStream source=input; FileOutputStream output=new FileOutputStream(temporary)) {
            byte[] buffer=new byte[65536]; int count;
            while ((count=source.read(buffer))!=-1) { size+=count; if(size>MAX_BYTES || retained+size>256L*1024*1024) throw new IOException("Mobile captures are limited to 32 MB."); output.write(buffer,0,count); digest.update(buffer,0,count); }
            output.getFD().sync();
        } catch(Exception error) { temporary.delete(); throw error; }
        if(size==0) { temporary.delete(); throw new IOException("The shared source is empty."); }
        File body=bytes(c,id); if(!temporary.renameTo(body)) { temporary.delete(); throw new IOException("Could not save capture locally."); }
        StringBuilder hash=new StringBuilder(); for(byte b:digest.digest()) hash.append(String.format(java.util.Locale.ROOT,"%02x",b & 255));
        origin.put("deviceId",device(c)).put("deviceName",android.os.Build.MODEL).put("platform","android").put("sha256",hash.toString()).put("sizeBytes",size);
        if(origin.optString("_tag").equals("Screen")) origin.put("captureId",id).put("scope","visible-screen");
        else if(origin.optString("_tag").equals("Web")) origin.put("captureId",id);
        else if(!origin.has("fileName")) origin.put("fileName",id+"."+(mime.equals("application/pdf")?"pdf":mime.equals("image/png")?"png":"bin"));
        JSONObject row=new JSONObject().put("id",id).put("owner",owner).put("session",session).put("title",title).put("mimeType",mime).put("kind",kind).put("sizeBytes",size).put("sha256",hash.toString()).put("origin",origin).put("phase","queued").put("created",System.currentTimeMillis()).put("nextAt",0).put("leaseUntil",0).put("undo",false).put("attempted",false);
        rows.put(row);
        try { write(c,rows); } catch(Exception error) { body.delete(); throw error; }
        return row;
    }
    static File bytes(Context c,String id) {
        if(!id.matches("[a-fA-F0-9-]{36}")) throw new IllegalArgumentException("Invalid capture ID.");
        try { JSONArray rows=read(c); for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(id.equals(row.optString("id")) && row.optBoolean("original")) return new File(directory(c),id+".original"); } }
        catch(Exception error) { throw new IllegalStateException("Could not read capture original.",error); }
        return new File(directory(c),id+".source");
    }
    static synchronized JSONObject original(Context c,String id,String owner,File temporary,String url,String mime,String hash,long size) throws Exception {
        JSONArray rows=read(c);
        for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(id.equals(row.optString("id")) && owner.equals(row.optString("owner"))) {
            if(!owner.equals(owner(c)) || row.optBoolean("undo") || row.optBoolean("attempted")) throw new IOException("Capture changed during acquisition.");
            long retained=size;
            for(int n=0;n<rows.length();n++) { JSONObject other=rows.getJSONObject(n); if(!id.equals(other.getString("id"))) retained+=bytes(c,other.getString("id")).length(); }
            if(retained>256L*1024*1024) throw new IOException("Capture queue is full. Finish or undo pending originals first.");
            JSONObject previous=row.getJSONObject("origin");
            JSONObject origin=new JSONObject().put("_tag","Web").put("url",url).put("title",row.getString("title")).put("browser","other").put("capturedAt",previous.getString("capturedAt"))
                .put("platform","android").put("captureId",id).put("deviceId",previous.getString("deviceId")).put("deviceName",previous.getString("deviceName"));
            if(previous.has("note")) origin.put("note",previous.getString("note"));
            File original=new File(directory(c),id+".original");
            if(!temporary.renameTo(original)) throw new IOException("Could not retain original source.");
            row.remove("acquisitionUrl");
            row.put("origin",origin).put("original",true).put("sha256",hash).put("sizeBytes",size).put("mimeType",mime).put("kind",CaptureSources.kind(mime));
            try { write(c,rows); } catch(Exception error) { original.delete(); throw error; }
            new File(directory(c),id+".source").delete(); return row;
        }}
        throw new IOException("Capture is no longer available.");
    }
    static synchronized JSONObject stageUrl(Context c,String owner,String session,String url) throws Exception {
        return stageUrl(c,owner,session,url,false);
    }
    static synchronized JSONObject stageUrl(Context c,String owner,String session,String url,boolean requireMedia) throws Exception {
        JSONObject origin=new JSONObject().put("_tag","Web").put("url",url).put("title",url.substring(0,Math.min(url.length(),200))).put("browser","other").put("capturedAt",Instant.now().toString());
        JSONObject staged=stage(c,owner,session,new ByteArrayInputStream(url.getBytes(java.nio.charset.StandardCharsets.UTF_8)),url.substring(0,Math.min(url.length(),200)),"text/uri-list","web-page",origin);
        JSONArray rows=read(c); for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(row.getString("id").equals(staged.getString("id"))) { row.put("acquisitionUrl",url).put("requireMedia",requireMedia); write(c,rows); return row; } }
        throw new IOException("Could not queue original URL.");
    }
    static boolean terminal(String phase) { return phase.equals("paused") || phase.equals("ready") || phase.equals("partial") || phase.equals("undone") || phase.equals("failed"); }
    static synchronized JSONObject get(Context c,String id,String owner) throws Exception {
        JSONArray rows=read(c); for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(row.getString("id").equals(id) && row.getString("owner").equals(owner)) return row; }
        throw new IOException("Capture is no longer available.");
    }
    static synchronized JSONObject claim(Context c,String owner) throws Exception {
        if(owner.isEmpty() || !owner.equals(owner(c))) return null;
        JSONArray rows=read(c); long now=System.currentTimeMillis();
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.getJSONObject(i);
            if(!row.getString("owner").equals(owner) || terminal(row.optString("phase")) || row.optLong("leaseUntil")>now || row.optLong("nextAt")>now) continue;
            row.put("leaseUntil",now+300_000); write(c,rows);
            JSONObject result=new JSONObject(row.toString()); result.put("uri",bytes(c,row.getString("id")).toURI().toString()); return result;
        }
        return null;
    }
    static synchronized JSONObject update(Context c,String id,String owner,JSONObject changes) throws Exception {
        JSONArray rows=read(c); JSONObject found=null;
        for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(row.getString("id").equals(id) && row.getString("owner").equals(owner)) {
            boolean alreadyUndone=row.optString("phase").equals("undone");
            // Undo is monotonic. A late upload update cannot turn it back into a saved receipt.
            for(java.util.Iterator<String> keys=changes.keys();keys.hasNext();) { String key=keys.next(); if(java.util.Arrays.asList("phase","ticket","fileId","leaseUntil","nextAt","attempted","error","retry","attempts").contains(key)) row.put(key,changes.get(key)); }
            if(alreadyUndone) row.put("phase","undone");
            if(row.optBoolean("undo") && !row.optString("phase").equals("undone")) row.put("phase","undoing");
            found=row; break;
        }}
        if(found==null) throw new IOException("Capture is no longer available."); write(c,rows);
        if(found.optString("phase").equals("undone") || found.has("fileId")) bytes(c,id).delete();
        return found;
    }
    static synchronized JSONObject action(Context c,String id,String action) throws Exception {
        JSONArray rows=read(c); String owner=owner(c);
        for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(row.getString("id").equals(id) && row.getString("owner").equals(owner)) {
            if(action.equals("undo")) { row.put("undo",true).put("phase",row.optBoolean("attempted")?"undoing":"undone"); if(!row.optBoolean("attempted")) bytes(c,id).delete(); }
            else if(action.equals("retry")) row.put("retry",true).put("phase",row.optBoolean("undo")?"undoing":"queued").put("attempts",0);
            row.put("nextAt",0); write(c,rows); return row;
        }} throw new IOException("Capture is no longer available.");
    }
    static synchronized JSONObject latest(Context c) throws Exception {
        JSONArray rows=read(c); for(int i=rows.length()-1;i>=0;i--) { JSONObject row=rows.getJSONObject(i); if(row.getString("owner").equals(owner(c))) return row; } return null;
    }
    static synchronized void defer(Context c) throws Exception {
        JSONArray rows=read(c); String owner=owner(c);
        for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(row.getString("owner").equals(owner) && !terminal(row.optString("phase"))) row.put("leaseUntil",0).put("nextAt",System.currentTimeMillis()+60000).put("phase",row.optBoolean("undo")?"undoing":"waiting"); }
        write(c,rows);
    }
    static synchronized long next(Context c) throws Exception {
        JSONArray rows=read(c); long next=Long.MAX_VALUE; String owner=owner(c);
        for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if(row.getString("owner").equals(owner) && !terminal(row.optString("phase"))) next=Math.min(next,Math.max(row.optLong("nextAt"),row.optLong("leaseUntil"))); }
        return next;
    }
}
