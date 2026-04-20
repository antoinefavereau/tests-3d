// ─── GLTF / GLB types (subset needed for DamagedHelmet) ─────────────────────

interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number; // 5120=BYTE 5121=UBYTE 5122=SHORT 5123=USHORT 5125=UINT 5126=FLOAT
  count: number;
  type: string; // SCALAR VEC2 VEC3 VEC4 MAT4 …
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

interface GltfImage {
  bufferView?: number;
  mimeType?: string;
  uri?: string;
}

interface GltfTexture {
  source: number;
}

interface GltfMaterial {
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
    baseColorFactor?: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
  };
  normalTexture?: { index: number };
  occlusionTexture?: { index: number };
  emissiveTexture?: { index: number };
  emissiveFactor?: number[];
}

interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
}

interface GltfJson {
  asset: { version: string };
  meshes: Array<{ primitives: GltfPrimitive[] }>;
  materials: GltfMaterial[];
  textures: GltfTexture[];
  images: GltfImage[];
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  buffers: Array<{ byteLength: number }>;
  nodes?: Array<{
    mesh?: number;
    rotation?: number[];
    translation?: number[];
    scale?: number[];
    matrix?: number[];
  }>;
  scenes?: Array<{ nodes: number[] }>;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ModelTextures {
  baseColor: ImageBitmap | null;
  normal: ImageBitmap | null;
  metallicRoughness: ImageBitmap | null;
  emissive: ImageBitmap | null;
  occlusion: ImageBitmap | null;
}

export interface ParsedModel {
  positions: Float32Array;
  normals: Float32Array;
  texcoords: Float32Array;
  tangents: Float32Array; // empty Float32Array when hasTangents=false
  hasTangents: boolean;
  indices: Uint16Array | Uint32Array;
  indexType: "UNSIGNED_SHORT" | "UNSIGNED_INT";
  textures: ModelTextures;
  stats: { vertexCount: number; triangleCount: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_ELEMENT_COUNT: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const TYPED_ARRAY_CTORS: Record<number, any> = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

function parseGlbBinary(buffer: ArrayBuffer): {
  json: GltfJson;
  binary: ArrayBuffer;
} {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error("Not a GLB file (bad magic)");

  let offset = 12; // skip 12-byte header

  // Chunk 0 — JSON
  const jsonLen = view.getUint32(offset, true);
  const jsonBytes = new Uint8Array(buffer, offset + 8, jsonLen);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as GltfJson;
  offset += 8 + jsonLen;

  // Chunk 1 — BIN
  const binLen = view.getUint32(offset, true);
  const binary = buffer.slice(offset + 8, offset + 8 + binLen);

  return { json, binary };
}

function readAccessor(
  json: GltfJson,
  binary: ArrayBuffer,
  index: number,
): ArrayBufferView {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const Ctor = TYPED_ARRAY_CTORS[acc.componentType];
  const elemCount = TYPE_ELEMENT_COUNT[acc.type];
  const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const byteLen = acc.count * elemCount * Ctor.BYTES_PER_ELEMENT;
  // Slice to guarantee alignment regardless of offset
  return new Ctor(binary.slice(byteOffset, byteOffset + byteLen));
}

function rotateVec3Array(arr: Float32Array, q: number[]) {
  const [qx, qy, qz, qw] = q;
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    arr[i]     = x + qw * tx + (qy * tz - qz * ty);
    arr[i + 1] = y + qw * ty + (qz * tx - qx * tz);
    arr[i + 2] = z + qw * tz + (qx * ty - qy * tx);
  }
}

function rotateVec4Array(arr: Float32Array, q: number[]) {
  const [qx, qy, qz, qw] = q;
  for (let i = 0; i < arr.length; i += 4) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    arr[i]     = x + qw * tx + (qy * tz - qz * ty);
    arr[i + 1] = y + qw * ty + (qz * tx - qx * tz);
    arr[i + 2] = z + qw * tz + (qx * ty - qy * tx);
  }
}
async function imageBitmapFromBufferView(
  json: GltfJson,
  binary: ArrayBuffer,
  imageIndex: number,
): Promise<ImageBitmap | null> {
  const img = json.images[imageIndex];
  if (!img) return null;

  if (img.bufferView !== undefined) {
    const bv = json.bufferViews[img.bufferView];
    const bytes = binary.slice(
      bv.byteOffset ?? 0,
      (bv.byteOffset ?? 0) + bv.byteLength,
    );
    const blob = new Blob([bytes], { type: img.mimeType ?? "image/png" });
    return createImageBitmap(blob, { colorSpaceConversion: "none" });
  }

  if (img.uri) {
    const res = await fetch(img.uri);
    return createImageBitmap(await res.blob(), {
      colorSpaceConversion: "none",
    });
  }

  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function loadGlbModel(
  url: string,
  signal?: AbortSignal,
): Promise<ParsedModel> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Failed to fetch model: ${response.status}`);
  const buffer = await response.arrayBuffer();

  const { json, binary } = parseGlbBinary(buffer);
  const node = json.nodes?.[0];
  const prim = json.meshes[node?.mesh ?? 0].primitives[0];

  // For this simple loader, we manually apply the first node's rotation to vertices
  // DamagedHelmet has a [0.707, 0, 0, 0.707] rotation (90deg X)
  const q = node?.rotation || [0, 0, 0, 1];

  // ── Vertex attributes ────────────────────────────────────────────────────
  const positions = readAccessor(
    json,
    binary,
    prim.attributes.POSITION,
  ) as Float32Array;
  const normals = readAccessor(
    json,
    binary,
    prim.attributes.NORMAL,
  ) as Float32Array;

  const texcoords = readAccessor(
    json,
    binary,
    prim.attributes.TEXCOORD_0,
  ) as Float32Array;
  const tangents =
    prim.attributes.TANGENT !== undefined
      ? (readAccessor(json, binary, prim.attributes.TANGENT) as Float32Array)
      : null;

  // Apply node rotation to vertex data
  if (node?.rotation) {
    rotateVec3Array(positions, q);
    rotateVec3Array(normals, q);
    if (tangents) rotateVec4Array(tangents, q);
  }

  // ── Indices ───────────────────────────────────────────────────────────────
  let indices: Uint16Array | Uint32Array;
  let indexType: "UNSIGNED_SHORT" | "UNSIGNED_INT";
  if (prim.indices !== undefined) {
    const acc = json.accessors[prim.indices];
    const raw = readAccessor(json, binary, prim.indices);
    if (acc.componentType === 5125) {
      indices = raw as Uint32Array;
      indexType = "UNSIGNED_INT";
    } else {
      indices = raw as Uint16Array;
      indexType = "UNSIGNED_SHORT";
    }
  } else {
    const count = json.accessors[prim.attributes.POSITION].count;
    indices = new Uint32Array(count).map((_, i) => i);
    indexType = "UNSIGNED_INT";
  }

  // ── Textures ──────────────────────────────────────────────────────────────
  const mat =
    prim.material !== undefined ? (json.materials[prim.material] ?? {}) : {};
  const pbr = mat.pbrMetallicRoughness ?? {};

  const resolve = (info?: { index: number }) =>
    info
      ? imageBitmapFromBufferView(
          json,
          binary,
          json.textures[info.index].source,
        )
      : Promise.resolve(null);

  const [baseColor, normal, metallicRoughness, emissive, occlusion] =
    await Promise.all([
      resolve(pbr.baseColorTexture),
      resolve(mat.normalTexture),
      resolve(pbr.metallicRoughnessTexture),
      resolve(mat.emissiveTexture),
      resolve(mat.occlusionTexture),
    ]);

  return {
    positions,
    normals,
    texcoords,
    tangents: tangents ?? new Float32Array(0),
    hasTangents: tangents !== null,
    indices,
    indexType,
    textures: { baseColor, normal, metallicRoughness, emissive, occlusion },
    stats: {
      vertexCount: json.accessors[prim.attributes.POSITION].count,
      triangleCount: indices.length / 3,
    },
  };
}
