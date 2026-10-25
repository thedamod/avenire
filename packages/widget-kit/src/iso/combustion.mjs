/** GLSL1 combustion field. Coordinates: x along the flame [0,1], yz / local radius.
 * Returns unpremultiplied RGB and extinction density; integrate front to back.
 * Qualitative turbulent combustion, not CFD or a temperature measurement.
 */
export const GLSL_COMBUSTION = `
float combustionHash(vec3 p){
  p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
float combustionNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(combustionHash(i),combustionHash(i+vec3(1,0,0)),f.x),
    mix(combustionHash(i+vec3(0,1,0)),combustionHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(combustionHash(i+vec3(0,0,1)),combustionHash(i+vec3(1,0,1)),f.x),
    mix(combustionHash(i+vec3(0,1,1)),combustionHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float combustionFbm(vec3 p){
  float n=0.,a=.57;
  for(int j=0;j<4;j++){n+=a*combustionNoise(p);p=p*2.03+vec3(7.1,13.7,3.9);a*=.47;}
  return n;
}
vec4 combustionSample(vec3 p,float time,float fuel){
  fuel=clamp(fuel,0.,1.);
  if(fuel<.001 || p.x<=0. || p.x>=1. || length(p.yz)>1.2) return vec4(0.);
  vec3 q=vec3(p.x*9.-time*(1.6+fuel*1.3),p.yz*2.1);
  vec2 warp=vec2(combustionNoise(q*.63+vec3(5,0,2)),combustionNoise(q*.71+vec3(0,8,3)))-.5;
  float radius=length(p.yz+warp*.65*smoothstep(0.,.6,p.x));
  float n=combustionFbm(q);
  float envelope=smoothstep(0.,.045,p.x)*(1.-smoothstep(.65,1.,p.x));
  float edge=1.-smoothstep(.42,1.05,radius+(n-.5)*.85);
  float tongues=smoothstep(.22,.68,n);
  float density=max(0.,edge)*envelope*(.1+1.9*tongues)*fuel;
  float heat=clamp((1.-radius)*(.6+1.1*tongues),0.,1.);
  vec3 colour=mix(vec3(.95,.12,.015),vec3(1.,.48,.055),smoothstep(.04,.55,heat));
  colour=mix(colour,vec3(1.,.91,.57),smoothstep(.48,.86,heat));
  return vec4(colour,density);
}
`;
