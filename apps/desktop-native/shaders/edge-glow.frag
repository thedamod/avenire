#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 surfaceSize;
    vec2 regionOffset;
    vec2 regionSize;
    float flow;
    float strength;
    float errorState;
    vec4 dawnBlue;
    vec4 dawnViolet;
    vec4 dawnOrchid;
};
void main() {
    vec2 point = regionOffset + qt_TexCoord0 * regionSize;
    vec2 centered = point - surfaceSize * 0.5;
    // A rounded, inset perimeter. Only narrow edge quads invoke this shader;
    // the transparent center needs neither a texture nor a fullscreen blur pass.
    float radius = 22.0;
    vec2 q = abs(centered) - (surfaceSize * 0.5 - vec2(3.0 + radius));
    float distance = abs(length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius);
    float core = exp(-distance * distance / 1.7);
    float halo = exp(-distance * 0.16) * 0.45;
    float alpha = clamp((core * 0.92 + halo) * strength, 0.0, 1.0);
    float t = fract(atan(centered.y, centered.x) / 6.2831853 + 0.5 + flow);
    vec3 ink;
    if (t < 0.333333)
        ink = mix(dawnBlue.rgb, dawnViolet.rgb, smoothstep(0.0, 0.333333, t));
    else if (t < 0.666667)
        ink = mix(dawnViolet.rgb, dawnOrchid.rgb, smoothstep(0.333333, 0.666667, t));
    else
        ink = mix(dawnOrchid.rgb, dawnBlue.rgb, smoothstep(0.666667, 1.0, t));
    ink = mix(ink, vec3(0.929, 0.388, 0.486), errorState);
    ink = mix(ink, vec3(1.0), core * 0.20);
    fragColor = vec4(ink * alpha, alpha) * qt_Opacity;
}
