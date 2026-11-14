package com.thedamod.avenire.essentialkey;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Native boundary validation mirrors @avenire/contracts DesktopOverlayAnnotation. */
final class ScreenAnnotation {
    final String id, kind, text, color;
    final float x, y, width, height;
    private ScreenAnnotation(JSONObject item) throws JSONException {
        id = string(item, "id", 100, false); kind = string(item, "kind", 20, false);
        if (!kind.equals("rect") && !kind.equals("arrow") && !kind.equals("label") && !kind.equals("cursor")) throw new JSONException("Unknown annotation kind");
        x = number(item, "x", false); y = number(item, "y", false);
        width = number(item, "width", true); height = number(item, "height", true);
        text = string(item, "text", 512, true); color = string(item, "color", 9, true);
        if (!color.isEmpty() && !color.matches("#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?")) throw new JSONException("Invalid annotation color");
    }
    private static String string(JSONObject item, String key, int max, boolean optional) throws JSONException {
        if (!item.has(key) && optional) return "";
        Object value = item.get(key);
        if (!(value instanceof String) || ((String)value).length() > max) throw new JSONException("Invalid " + key);
        return (String)value;
    }
    private static float number(JSONObject item, String key, boolean optional) throws JSONException {
        if (!item.has(key) && optional) return 0.1f;
        Object value = item.get(key);
        if (!(value instanceof Number)) throw new JSONException("Invalid " + key);
        double n = ((Number)value).doubleValue();
        if (Double.isNaN(n) || Double.isInfinite(n) || n < 0 || n > 1) throw new JSONException("Out of bounds " + key);
        return (float)n;
    }
    static List<ScreenAnnotation> parse(JSONArray input) throws JSONException {
        if (input.length() > 32) throw new JSONException("Too many annotations");
        List<ScreenAnnotation> result = new ArrayList<>();
        for (int i = 0; i < input.length(); i++) result.add(new ScreenAnnotation(input.getJSONObject(i)));
        return Collections.unmodifiableList(result);
    }
}
