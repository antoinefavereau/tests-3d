"use client";

import { useEffect, useRef, useState } from "react";
import { loadGlbModel, type ParsedModel } from "./glb-loader";
import { VERTEX_SHADER, FRAGMENT_SHADER } from "./shaders";
import {
  mat4Create,
  mat4Perspective,
  mat4LookAt,
  mat3FromMat4,
  sphericalToCartesian,
} from "./math";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GpuInfo {
  vendor: string;
  renderer: string;
}
interface Stats {
  fps: number;
  frameMs: number;
  triangles: number;
  vertices: number;
  drawCalls: number;
  gpuInfo: GpuInfo;
}

// ─── WebGL helpers ────────────────────────────────────────────────────────────

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error:\n${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error:\n${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

function uploadBuffer(
  gl: WebGL2RenderingContext,
  data: ArrayBufferView,
  target: number,
): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(target, buf);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buf;
}

function bindAttrib(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  buf: WebGLBuffer,
  size: number,
): void {
  const loc = gl.getAttribLocation(program, name);
  if (loc === -1) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  image: ImageBitmap,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

function createFallbackTexture(
  gl: WebGL2RenderingContext,
  r: number,
  g: number,
  b: number,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([r, g, b, 255]),
  );
  return tex;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WebGLViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initialising WebGL…");
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 3.0 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  // ── Main effect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) {
      setError("WebGL 2.0 is not supported in this browser.");
      setLoading(false);
      return;
    }

    // GPU info
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpuInfo: GpuInfo = dbg
      ? {
          vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
        }
      : { vendor: "Unknown", renderer: "Unknown" };

    // Resize observer — keep canvas pixel-perfect
    let animFrame = 0;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      gl.viewport(0, 0, canvas.width, canvas.height);
    });
    ro.observe(canvas);

    // Compile shaders
    let program: WebGLProgram;
    try {
      program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    } catch (e) {
      setError(String(e));
      setLoading(false);
      ro.disconnect();
      return;
    }

    const ac = new AbortController();
    // Capture as non-null for use inside closures
    const glCtx: WebGL2RenderingContext = gl;
    const cvs: HTMLCanvasElement = canvas;

    (async () => {
      let model: ParsedModel;
      try {
        setLoadingMsg("Fetching DamagedHelmet.glb (~3.6 MB)…");
        model = await loadGlbModel("/models/DamagedHelmet.glb", ac.signal);
        setLoadingMsg("Uploading vertex data & textures to GPU…");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(`Model load failed:\n${e}`);
        setLoading(false);
        return;
      }
      if (ac.signal.aborted) return;

      // ── VAO ────────────────────────────────────────────────────────────────
      const vao = glCtx.createVertexArray()!;
      glCtx.bindVertexArray(vao);
      bindAttrib(
        glCtx,
        program,
        "a_position",
        uploadBuffer(glCtx, model.positions, glCtx.ARRAY_BUFFER),
        3,
      );
      bindAttrib(
        glCtx,
        program,
        "a_normal",
        uploadBuffer(glCtx, model.normals, glCtx.ARRAY_BUFFER),
        3,
      );
      bindAttrib(
        glCtx,
        program,
        "a_texcoord_0",
        uploadBuffer(glCtx, model.texcoords, glCtx.ARRAY_BUFFER),
        2,
      );
      uploadBuffer(glCtx, model.indices, glCtx.ELEMENT_ARRAY_BUFFER); // stays bound in VAO
      const indexGlType =
        model.indexType === "UNSIGNED_INT"
          ? glCtx.UNSIGNED_INT
          : glCtx.UNSIGNED_SHORT;
      glCtx.bindVertexArray(null);

      // ── Textures ───────────────────────────────────────────────────────────
      const { textures: t } = model;
      const glTex = {
        baseColor: t.baseColor
          ? uploadTexture(glCtx, t.baseColor)
          : createFallbackTexture(glCtx, 200, 200, 200),
        normal: t.normal
          ? uploadTexture(glCtx, t.normal)
          : createFallbackTexture(glCtx, 128, 128, 255),
        metallicRoughness: t.metallicRoughness
          ? uploadTexture(glCtx, t.metallicRoughness)
          : createFallbackTexture(glCtx, 0, 128, 0),
        emissive: t.emissive
          ? uploadTexture(glCtx, t.emissive)
          : createFallbackTexture(glCtx, 0, 0, 0),
        occlusion: t.occlusion
          ? uploadTexture(glCtx, t.occlusion)
          : createFallbackTexture(glCtx, 255, 255, 255),
      };

      // ── Uniforms ───────────────────────────────────────────────────────────
      glCtx.useProgram(program);
      const u = (n: string) => glCtx.getUniformLocation(program, n);
      const uni = {
        model: u("u_model"),
        view: u("u_view"),
        projection: u("u_projection"),
        normalMatrix: u("u_normalMatrix"),
        cameraPos: u("u_cameraPos"),
        lightDir0: u("u_lightDir0"),
        lightColor0: u("u_lightColor0"),
        lightDir1: u("u_lightDir1"),
        lightColor1: u("u_lightColor1"),
        baseColor: u("u_baseColor"),
        normalMap: u("u_normal"),
        metalRough: u("u_metallicRoughness"),
        emissive: u("u_emissive"),
        occlusion: u("u_occlusion"),
      };

      // Texture unit bindings (set once)
      glCtx.uniform1i(uni.baseColor, 0);
      glCtx.uniform1i(uni.normalMap, 1);
      glCtx.uniform1i(uni.metalRough, 2);
      glCtx.uniform1i(uni.emissive, 3);
      glCtx.uniform1i(uni.occlusion, 4);

      // Lights — toward-light direction, world space
      glCtx.uniform3f(uni.lightDir0, 0.5, 1.0, 0.8); // key: top-right-front
      glCtx.uniform3f(uni.lightColor0, 3.2, 2.8, 2.5);
      glCtx.uniform3f(uni.lightDir1, -1.0, 0.2, -0.5); // fill: bottom-left-back
      glCtx.uniform3f(uni.lightColor1, 0.4, 0.5, 0.6);

      // ── GL state ──────────────────────────────────────────────────────────
      glCtx.clearColor(0.04, 0.04, 0.06, 1);
      glCtx.enable(glCtx.DEPTH_TEST);
      glCtx.depthFunc(glCtx.LEQUAL);
      glCtx.enable(glCtx.CULL_FACE);
      glCtx.cullFace(glCtx.BACK);

      // ── Render loop ───────────────────────────────────────────────────────
      let lastTime = 0;
      const fpsSamples: number[] = [];
      let fpsTimer = 0;

      function render(time: number) {
        animFrame = requestAnimationFrame(render);
        const dt = time - lastTime || 16.67;
        lastTime = time;

        fpsSamples.push(1000 / dt);
        if (fpsSamples.length > 30) fpsSamples.shift();
        fpsTimer += dt;
        if (fpsTimer >= 250) {
          fpsTimer = 0;
          const avgFps =
            fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
          setStats({
            fps: Math.round(avgFps),
            frameMs: Math.round(dt * 10) / 10,
            triangles: model.stats.triangleCount,
            vertices: model.stats.vertexCount,
            drawCalls: 1,
            gpuInfo,
          });
        }

        if (autoRef.current) orbitRef.current.azimuth += 0.004;

        const { azimuth, elevation, radius } = orbitRef.current;
        const eye = sphericalToCartesian(azimuth, elevation, radius);

        const aspect = cvs.width / cvs.height || 1;
        const proj = mat4Perspective(Math.PI / 4, aspect, 0.1, 100);
        const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
        const modelM = mat4Create();
        const nm = mat3FromMat4(modelM);

        glCtx.uniformMatrix4fv(uni.model, false, modelM);
        glCtx.uniformMatrix4fv(uni.view, false, view);
        glCtx.uniformMatrix4fv(uni.projection, false, proj);
        glCtx.uniformMatrix3fv(uni.normalMatrix, false, nm);
        glCtx.uniform3fv(uni.cameraPos, eye);

        // Bind textures
        glCtx.activeTexture(glCtx.TEXTURE0);
        glCtx.bindTexture(glCtx.TEXTURE_2D, glTex.baseColor);
        glCtx.activeTexture(glCtx.TEXTURE1);
        glCtx.bindTexture(glCtx.TEXTURE_2D, glTex.normal);
        glCtx.activeTexture(glCtx.TEXTURE2);
        glCtx.bindTexture(glCtx.TEXTURE_2D, glTex.metallicRoughness);
        glCtx.activeTexture(glCtx.TEXTURE3);
        glCtx.bindTexture(glCtx.TEXTURE_2D, glTex.emissive);
        glCtx.activeTexture(glCtx.TEXTURE4);
        glCtx.bindTexture(glCtx.TEXTURE_2D, glTex.occlusion);

        glCtx.clear(glCtx.COLOR_BUFFER_BIT | glCtx.DEPTH_BUFFER_BIT);
        glCtx.bindVertexArray(vao);
        glCtx.drawElements(
          glCtx.TRIANGLES,
          model.indices.length,
          indexGlType,
          0,
        );
        glCtx.bindVertexArray(null);
      }

      setLoading(false);
      animFrame = requestAnimationFrame(render);
    })();

    return () => {
      ac.abort();
      cancelAnimationFrame(animFrame);
      ro.disconnect();
    };
  }, []);

  // ── Orbit controls ───────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    autoRef.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    orbitRef.current.azimuth -= dx * 0.008;
    orbitRef.current.elevation = Math.max(
      -1.2,
      Math.min(1.2, orbitRef.current.elevation + dy * 0.008),
    );
  };
  const onPointerUp = () => {
    dragRef.current.active = false;
  };
  const onWheel = (e: React.WheelEvent) => {
    orbitRef.current.radius = Math.max(
      1.2,
      Math.min(8, orbitRef.current.radius + e.deltaY * 0.005),
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 flex-1">
      {/* Canvas */}
      <div className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-white/10 bg-[#080a0e]">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080a0e]/95">
            <div className="w-7 h-7 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <p className="text-xs text-white/50 font-mono">{loadingMsg}</p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e]/95 p-6">
            <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap text-center">
              {error}
            </pre>
          </div>
        )}

        {/* Stats HUD */}
        {stats && !loading && (
          <div className="absolute top-3 left-3 flex flex-col gap-1 font-mono text-[11px] select-none pointer-events-none">
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-md text-white/75">
              <span className="text-green-400 font-medium">
                {stats.fps} FPS
              </span>
              <span>{stats.frameMs} ms</span>
              <span className="text-blue-300">
                △ {stats.triangles.toLocaleString()}
              </span>
              <span>∧ {stats.vertices.toLocaleString()}</span>
              <span className="text-yellow-300">D {stats.drawCalls}</span>
            </div>
            {stats.gpuInfo.renderer !== "Unknown" && (
              <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md text-white/40 truncate max-w-sm">
                {stats.gpuInfo.renderer.replace(/\(.*?\)/g, "").trim()}
              </div>
            )}
          </div>
        )}

        {/* Hint */}
        {!loading && !error && (
          <p className="absolute bottom-3 right-3 text-[10px] text-white/25 font-mono pointer-events-none select-none">
            drag · scroll to zoom
          </p>
        )}
      </div>
    </div>
  );
}
