// ─── WGSL Shaders ─────────────────────────────────────────────────────────────
// WebGPU uses WGSL (WebGPU Shading Language) instead of GLSL.
// Key differences from GLSL:
//   • No #version directive — WGSL is versioned with the API
//   • Explicit @group / @binding resource declarations
//   • @vertex / @fragment stage annotations instead of separate programs
//   • var<uniform>, var<storage> — explicit address space qualifiers
//   • let is immutable, var is mutable — no gl_Position = set via @builtin
//   • mat3x3f, vec3f, f32 instead of mat3, vec3, float
//   • dpdx/dpdy → dpdx/dpdy (same concept, different name)

// ─── Uniform buffer layout (std430 / WGSL alignment) ─────────────────────────
// Offset   Size  Field
//   0       64   model        (mat4x4f)
//  64       64   view         (mat4x4f)
// 128       64   projection   (mat4x4f)
// 192       64   normal_matrix (mat4x4f — use upper-left 3x3)
// 256       12   camera_pos   (vec3f)    + 4 pad
// 272       12   light_dir0   (vec3f)    + 4 pad
// 288       12   light_color0 (vec3f)    + 4 pad
// 304       12   light_dir1   (vec3f)    + 4 pad
// 320       12   light_color1 (vec3f)    + 4 pad
// Total: 336 bytes
export const UNIFORM_BUFFER_SIZE = 336;

export const WGSL_SHADER = /* wgsl */ `

// ── Uniform struct ─────────────────────────────────────────────────────────────
struct Uniforms {
  model:         mat4x4f,
  view:          mat4x4f,
  projection:    mat4x4f,
  normal_matrix: mat4x4f,
  camera_pos:  vec3f, pad0: f32,
  light_dir0:  vec3f, pad1: f32,
  light_color0:vec3f, pad2: f32,
  light_dir1:  vec3f, pad3: f32,
  light_color1:vec3f, pad4: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var smp: sampler;

@group(1) @binding(0) var t_base_color:  texture_2d<f32>;
@group(1) @binding(1) var t_normal:      texture_2d<f32>;
@group(1) @binding(2) var t_metal_rough: texture_2d<f32>;
@group(1) @binding(3) var t_emissive:    texture_2d<f32>;
@group(1) @binding(4) var t_occlusion:   texture_2d<f32>;

// ── Vertex I/O ────────────────────────────────────────────────────────────────

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal:   vec3f,
  @location(2) texcoord: vec2f,
}

struct VertexOutput {
  @builtin(position) clip_pos:     vec4f,
  @location(0)       world_pos:    vec3f,
  @location(1)       world_normal: vec3f,
  @location(2)       texcoord:     vec2f,
}

// ── Vertex stage ──────────────────────────────────────────────────────────────

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let world_pos = u.model * vec4f(in.position, 1.0);
  out.world_pos = world_pos.xyz;

  // Extract 3×3 normal matrix from the 4×4 uniform (upper-left columns)
  let nm = mat3x3f(u.normal_matrix[0].xyz, u.normal_matrix[1].xyz, u.normal_matrix[2].xyz);
  out.world_normal = normalize(nm * in.normal);

  out.texcoord = in.texcoord;
  out.clip_pos = u.projection * u.view * world_pos;
  return out;
}

// ── Fragment helpers ──────────────────────────────────────────────────────────

fn srgb_to_linear(c: vec3f) -> vec3f {
  return pow(max(c, vec3f(0.0)), vec3f(2.2));
}

// Derivative-based TBN — no TANGENT attribute needed
// Ref: "Normal Mapping Without Precomputed Tangents" — Christian Schüler 2013
fn cotangent_frame(N: vec3f, p: vec3f, uv: vec2f) -> mat3x3f {
  let dp1  = dpdx(p);
  let dp2  = dpdy(p);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);

  let dp2perp = cross(dp2, N);
  let dp1perp = cross(N,   dp1);
  let T = dp2perp * duv1.x + dp1perp * duv2.x;
  let B = dp2perp * duv1.y + dp1perp * duv2.y;

  let invmax = inverseSqrt(max(dot(T, T), dot(B, B)));
  return mat3x3f(T * invmax, B * invmax, N);
}

// ── Cook-Torrance BRDF ────────────────────────────────────────────────────────

const PI: f32 = 3.14159265359;

fn D_GGX(NdotH: f32, roughness: f32) -> f32 {
  let a  = roughness * roughness;
  let a2 = a * a;
  let d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn G_SchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

fn G_Smith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
  return G_SchlickGGX(NdotV, roughness) * G_SchlickGGX(NdotL, roughness);
}

fn F_Schlick(cosTheta: f32, F0: vec3f) -> vec3f {
  return F0 + (vec3f(1.0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn light_contrib(
  N: vec3f, V: vec3f, L: vec3f,
  albedo: vec3f, metallic: f32, roughness: f32,
  light_color: vec3f,
) -> vec3f {
  let H     = normalize(V + L);
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 0.001);
  let NdotH = max(dot(N, H), 0.0);
  let F0    = mix(vec3f(0.04), albedo, metallic);
  let NDF   = D_GGX(NdotH, roughness);
  let G     = G_Smith(NdotV, NdotL, roughness);
  let F     = F_Schlick(max(dot(H, V), 0.0), F0);
  let kD    = (vec3f(1.0) - F) * (1.0 - metallic);
  let diffuse  = kD * albedo / PI;
  let specular = (NDF * G * F) / (4.0 * NdotV * NdotL + 0.0001);
  return (diffuse + specular) * light_color * NdotL;
}

// ── Fragment stage ────────────────────────────────────────────────────────────

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let base_sample = textureSample(t_base_color, smp, in.texcoord);
  let albedo      = base_sample.rgb; // sRGB format automatically converts to linear

  let mr_sample = textureSample(t_metal_rough, smp, in.texcoord);
  let roughness = clamp(mr_sample.g, 0.04, 1.0);
  let metallic  = mr_sample.b;

  let emissive  = textureSample(t_emissive, smp, in.texcoord).rgb; // sRGB format automatically converts to linear
  let occlusion = textureSample(t_occlusion, smp, in.texcoord).r;

  // Normal mapping via screen-space derivatives
  let Ngeom = normalize(in.world_normal);
  let TBN   = cotangent_frame(Ngeom, in.world_pos, in.texcoord);
  let nmap  = textureSample(t_normal, smp, in.texcoord).rgb * 2.0 - vec3f(1.0);
  let N     = normalize(TBN * nmap);
  let V     = normalize(u.camera_pos - in.world_pos);

  var Lo  = light_contrib(N, V, normalize(u.light_dir0),  albedo, metallic, roughness, u.light_color0);
      Lo += light_contrib(N, V, normalize(u.light_dir1),  albedo, metallic, roughness, u.light_color1);

  // Hemisphere ambient — Brightened to remove muddy look
  let sky_factor = 0.5 + 0.5 * dot(N, vec3f(0.0, 1.0, 0.0));
  let ambient = mix(vec3f(0.06, 0.06, 0.08), vec3f(0.12, 0.16, 0.25), sky_factor) * albedo * occlusion;

  var color = ambient + Lo + emissive * 3.0; // Boosted emissive for better glow
  
  // Brightness boost
  color = color * 1.1;

  // Reinhard + manual gamma (restored for compatibility)
  color = color / (color + vec3f(0.8)); // Slightly lower denominator for brighter result
  color = pow(color, vec3f(1.0 / 2.2));

  return vec4f(color, base_sample.a);
}
`;
