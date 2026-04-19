// ─── Vertex Shader ────────────────────────────────────────────────────────────

export const VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texcoord_0;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat3 u_normalMatrix;

out vec3 v_worldPos;
out vec3 v_worldNormal;
out vec2 v_texcoord;

void main() {
  vec4 worldPos  = u_model * vec4(a_position, 1.0);
  v_worldPos     = worldPos.xyz;
  v_worldNormal  = normalize(u_normalMatrix * a_normal);
  v_texcoord     = a_texcoord_0;
  gl_Position    = u_projection * u_view * worldPos;
}
`;

// ─── Fragment Shader ──────────────────────────────────────────────────────────
// Cook-Torrance BRDF with:
//   • GGX/Trowbridge-Reitz NDF
//   • Smith's geometry term (Schlick-GGX)
//   • Schlick Fresnel approximation
// TBN built from screen-space derivatives (no TANGENT attribute required).
// Two directional lights + hemisphere ambient. Reinhard tonemapped + gamma.

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec3 v_worldPos;
in vec3 v_worldNormal;
in vec2 v_texcoord;

uniform sampler2D u_baseColor;         // sRGB: albedo
uniform sampler2D u_normal;            // tangent-space normal map
uniform sampler2D u_metallicRoughness; // G=roughness B=metallic (linear)
uniform sampler2D u_emissive;          // sRGB: emissive colour
uniform sampler2D u_occlusion;         // R=ambient occlusion (linear)

uniform vec3 u_cameraPos;
uniform vec3 u_lightDir0;   // toward-light direction, world space
uniform vec3 u_lightColor0;
uniform vec3 u_lightDir1;
uniform vec3 u_lightColor1;

out vec4 outColor;

const float PI = 3.14159265359;

vec3 srgbToLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }

// ── Build TBN from screen-space derivatives (works without TANGENT attribute) ──
// Ref: "Normal Mapping Without Precomputed Tangents" — Christian Schüler 2013

mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1  = dFdx(p);
  vec3 dp2  = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);

  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;

  float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
  return mat3(T * invmax, B * invmax, N);
}

// ── BRDF ─────────────────────────────────────────────────────────────────────

float D_GGX(float NdotH, float roughness) {
  float a  = roughness * roughness;
  float a2 = a * a;
  float d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

float G_SchlickGGX(float NdotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float G_Smith(float NdotV, float NdotL, float roughness) {
  return G_SchlickGGX(NdotV, roughness) * G_SchlickGGX(NdotL, roughness);
}

vec3 F_Schlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 lightContrib(
  vec3 N, vec3 V, vec3 L,
  vec3 albedo, float metallic, float roughness,
  vec3 lightColor
) {
  vec3  H     = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.001);
  float NdotH = max(dot(N, H), 0.0);

  vec3  F0  = mix(vec3(0.04), albedo, metallic);
  float NDF = D_GGX(NdotH, roughness);
  float G   = G_Smith(NdotV, NdotL, roughness);
  vec3  F   = F_Schlick(max(dot(H, V), 0.0), F0);

  vec3 kD       = (vec3(1.0) - F) * (1.0 - metallic);
  vec3 diffuse  = kD * albedo / PI;
  vec3 specular = (NDF * G * F) / (4.0 * NdotV * NdotL + 1e-4);

  return (diffuse + specular) * lightColor * NdotL;
}

// ── Main ─────────────────────────────────────────────────────────────────────

void main() {
  vec4 baseColorSample = texture(u_baseColor, v_texcoord);
  vec3 albedo          = srgbToLinear(baseColorSample.rgb);

  vec4  mrSample  = texture(u_metallicRoughness, v_texcoord);
  float roughness = clamp(mrSample.g, 0.04, 1.0);
  float metallic  = mrSample.b;

  vec3  emissive  = srgbToLinear(texture(u_emissive, v_texcoord).rgb);
  float occlusion = texture(u_occlusion, v_texcoord).r;

  // Normal map via derivative-based TBN
  vec3 Ngeom = normalize(v_worldNormal);
  mat3 TBN   = cotangentFrame(Ngeom, v_worldPos, v_texcoord);
  vec3 nmap  = texture(u_normal, v_texcoord).rgb * 2.0 - 1.0;
  vec3 N     = normalize(TBN * nmap);
  vec3 V     = normalize(u_cameraPos - v_worldPos);

  // Two-light PBR
  vec3 Lo  = lightContrib(N, V, normalize(u_lightDir0), albedo, metallic, roughness, u_lightColor0);
       Lo += lightContrib(N, V, normalize(u_lightDir1), albedo, metallic, roughness, u_lightColor1);

  // Hemisphere ambient
  float skyFactor = 0.5 + 0.5 * dot(N, vec3(0.0, 1.0, 0.0));
  vec3 ambient = mix(vec3(0.03, 0.03, 0.04), vec3(0.05, 0.07, 0.12), skyFactor) * albedo * occlusion;

  vec3 color = ambient + Lo + emissive * 2.0;

  // Reinhard + gamma
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));

  outColor = vec4(color, baseColorSample.a);
}
`;
