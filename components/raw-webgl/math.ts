// All matrices are Float32Array stored COLUMN-MAJOR (OpenGL convention).
// mat[col * 4 + row]

export type Mat4 = Float32Array;
export type Mat3 = Float32Array;
export type Vec3 = [number, number, number];

export function mat4Create(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/** C = A * B (column-major) */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = s;
    }
  }
  return out;
}

/** Standard OpenGL perspective matrix (right-handed, NDC z in [-1, 1]) */
export function mat4Perspective(
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1.0 / Math.tan(fovY * 0.5);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

/** WebGPU perspective matrix (right-handed, NDC z in [0, 1]) */
export function mat4PerspectiveWebGPU(
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1.0 / Math.tan(fovY * 0.5);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    far * nf,
    -1,
    0,
    0,
    far * near * nf,
    0,
  ]);
}

/** Standard lookAt (right-handed) */
export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const ex = eye[0] - center[0],
    ey = eye[1] - center[1],
    ez = eye[2] - center[2];
  const zl = Math.hypot(ex, ey, ez);
  const z0 = ex / zl,
    z1 = ey / zl,
    z2 = ez / zl;

  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  const xl = Math.hypot(x0, x1, x2) || 1;
  x0 /= xl;
  x1 /= xl;
  x2 /= xl;

  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  return new Float32Array([
    x0,
    y0,
    z0,
    0,
    x1,
    y1,
    z1,
    0,
    x2,
    y2,
    z2,
    0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
    1,
  ]);
}

/** Extract upper-left 3×3 of a mat4 (column-major → column-major mat3) */
export function mat3FromMat4(m: Mat4): Mat3 {
  return new Float32Array([
    m[0],
    m[1],
    m[2], // col 0
    m[4],
    m[5],
    m[6], // col 1
    m[8],
    m[9],
    m[10], // col 2
  ]);
}

/** Spherical → Cartesian (azimuth + elevation in radians, radius) */
export function sphericalToCartesian(
  azimuth: number,
  elevation: number,
  radius: number,
): Vec3 {
  return [
    radius * Math.cos(elevation) * Math.sin(azimuth),
    radius * Math.sin(elevation),
    radius * Math.cos(elevation) * Math.cos(azimuth),
  ];
}
