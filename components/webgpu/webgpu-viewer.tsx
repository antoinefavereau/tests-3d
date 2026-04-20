"use client";

import { useEffect, useRef, useState } from "react";
import { loadGlbModel, type ParsedModel } from "../raw-webgl/glb-loader";
import {
  mat4Create,
  mat4PerspectiveWebGPU,
  mat4LookAt,
  mat3FromMat4,
  sphericalToCartesian,
} from "../raw-webgl/math";
import { WGSL_SHADER, UNIFORM_BUFFER_SIZE } from "./wgsl-shaders";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
}
interface Stats {
  fps: number;
  frameMs: number;
  triangles: number;
  vertices: number;
  drawCalls: number;
  adapterInfo: AdapterInfo;
}

// ─── GPU helpers ──────────────────────────────────────────────────────────────

function createGpuBuffer(
  device: GPUDevice,
  data: ArrayBufferView,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const buf = device.createBuffer({ size: data.byteLength, usage });
  device.queue.writeBuffer(
    buf,
    0,
    data.buffer as ArrayBuffer,
    data.byteOffset,
    data.byteLength,
  );
  return buf;
}

async function createTextureFromBitmap(
  device: GPUDevice,
  image: ImageBitmap,
  useSrgb: boolean = false,
  mipGenerator: (texture: GPUTexture) => void,
): Promise<GPUTexture> {
  const mipLevelCount = Math.floor(Math.log2(Math.max(image.width, image.height))) + 1;
  const format: GPUTextureFormat = useSrgb ? "rgba8unorm-srgb" : "rgba8unorm";

  const tex = device.createTexture({
    size: [image.width, image.height, 1],
    format,
    mipLevelCount,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: image, flipY: true },
    { texture: tex },
    [image.width, image.height],
  );

  if (mipLevelCount > 1) {
    mipGenerator(tex);
  }

  return tex;
}

function getMipmapGenerator(device: GPUDevice) {
  const blitSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const blitPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({
        code: `
          struct VertexOutput {
            @builtin(position) pos: vec4f,
            @location(0) uv: vec2f,
          }
          @vertex fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
            var pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
            var uv  = array<vec2f, 3>(vec2f(0,0),  vec2f(2,0),  vec2f(0,2));
            return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
          }
        `,
      }),
      entryPoint: "vs",
    },
    fragment: {
      module: device.createShaderModule({
        code: `
          @group(0) @binding(0) var s: sampler;
          @group(0) @binding(1) var t: texture_2d<f32>;
          @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
            return textureSample(t, s, uv);
          }
        `,
      }),
      entryPoint: "fs",
      targets: [{ format: "rgba8unorm" }],
    },
  });

  const pipelines = new Map<GPUTextureFormat, GPURenderPipeline>();

  return (texture: GPUTexture) => {
    let pipeline = pipelines.get(texture.format);
    if (!pipeline) {
      pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module: device.createShaderModule({
            code: `
              struct VertexOutput {
                @builtin(position) pos: vec4f,
                @location(0) uv: vec2f,
              }
              @vertex fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
                var pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
                var uv  = array<vec2f, 3>(vec2f(0,0),  vec2f(2,0),  vec2f(0,2));
                return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
              }
            `,
          }),
          entryPoint: "vs",
        },
        fragment: {
          module: device.createShaderModule({
            code: `
              @group(0) @binding(0) var s: sampler;
              @group(0) @binding(1) var t: texture_2d<f32>;
              @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
                return textureSample(t, s, uv);
              }
            `,
          }),
          entryPoint: "fs",
          targets: [{ format: texture.format }],
        },
      });
      pipelines.set(texture.format, pipeline);
    }

    const encoder = device.createCommandEncoder();
    for (let i = 1; i < texture.mipLevelCount; i++) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: texture.createView({ baseMipLevel: i, mipLevelCount: 1 }),
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: blitSampler },
          { binding: 1, resource: texture.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }) },
        ],
      }));
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  };
}

function createFallbackTexture(
  device: GPUDevice,
  r: number,
  g: number,
  b: number,
  useSrgb: boolean = false,
): GPUTexture {
  const format: GPUTextureFormat = useSrgb ? "rgba8unorm-srgb" : "rgba8unorm";
  const tex = device.createTexture({
    size: [1, 1, 1],
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    new Uint8Array([r, g, b, 255]),
    { bytesPerRow: 4 },
    [1, 1],
  );
  return tex;
}

function makeDepthTexture(
  device: GPUDevice,
  width: number,
  height: number,
  sampleCount: number = 1,
): GPUTexture {
  return device.createTexture({
    size: [width, height, 1],
    format: "depth32float",
    sampleCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

function makeMSAATexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
): GPUTexture {
  return device.createTexture({
    size: [width, height, 1],
    sampleCount: 4, // Harcoded for now as it's MSAA helper
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

// ─── Uniform buffer helpers ───────────────────────────────────────────────────
// Layout mirrors the WGSL Uniforms struct (see wgsl-shaders.ts for offsets)

function writeUniforms(
  device: GPUDevice,
  buffer: GPUBuffer,
  eye: [number, number, number],
  viewM: Float32Array,
  projM: Float32Array,
  modelM: Float32Array,
) {
  const nm3 = mat3FromMat4(modelM);
  // Copy 3x3 rotation into a 4x4 (column-major — each col padded to 4 floats)
  nm4[0] = nm3[0];
  nm4[1] = nm3[1];
  nm4[2] = nm3[2];
  nm4[4] = nm3[3];
  nm4[5] = nm3[4];
  nm4[6] = nm3[5];
  nm4[8] = nm3[6];
  nm4[9] = nm3[7];
  nm4[10] = nm3[8];
  nm4[15] = 1;

  stagingData.set(modelM, 0); // offset 0   — model
  stagingData.set(viewM, 16); // offset 64  — view
  stagingData.set(projM, 32); // offset 128 — projection
  stagingData.set(nm4, 48); // offset 192 — normal_matrix

  // vec3 camera_pos at offset 256 = float index 64
  stagingData[64] = eye[0];
  stagingData[65] = eye[1];
  stagingData[66] = eye[2];
  // light_dir0 at offset 272 = index 68
  stagingData[68] = 0.5;
  stagingData[69] = 1.0;
  stagingData[70] = 0.8;
  // light_color0 at index 72
  stagingData[72] = 3.2;
  stagingData[73] = 2.8;
  stagingData[74] = 2.5;
  // light_dir1 at index 76
  stagingData[76] = -1.0;
  stagingData[77] = 0.2;
  stagingData[78] = -0.5;
  // light_color1 at index 80
  stagingData[80] = 0.4;
  stagingData[81] = 0.5;
  stagingData[82] = 0.6;

  device.queue.writeBuffer(buffer, 0, stagingData);
}
const stagingData = new Float32Array(UNIFORM_BUFFER_SIZE / 4);
const nm4 = new Float32Array(16);

// ─── Component ────────────────────────────────────────────────────────────────

export function WebGPUViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Checking WebGPU support…");
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 3.0 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animFrame = 0;
    const ac = new AbortController();
    const cvs: HTMLCanvasElement = canvas;

    (async () => {
      // ── 1. Check support ─────────────────────────────────────────────────
      if (!navigator.gpu) {
        setUnsupported(true);
        setLoading(false);
        return;
      }

      // ── 2. Adapter + device ───────────────────────────────────────────────
      setLoadingMsg("Requesting GPU adapter…");
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance",
      });
      if (!adapter) {
        setError("No WebGPU adapter found — GPU may be disabled or blocked.");
        setLoading(false);
        return;
      }

      const device = await adapter.requestDevice();
      const adapterInfo: AdapterInfo = {
        vendor: adapter.info?.vendor ?? "Unknown",
        architecture: adapter.info?.architecture ?? "Unknown",
        device: adapter.info?.device ?? "",
      };

      if (ac.signal.aborted) return;

      // ── 3. Canvas context ─────────────────────────────────────────────────
      const ctx = canvas.getContext("webgpu") as GPUCanvasContext;
      const format = navigator.gpu.getPreferredCanvasFormat();
      const canvasFormat = format;
      
      ctx.configure({ device, format: canvasFormat, alphaMode: "premultiplied" });

      const SAMPLE_COUNT = 4;

      // ── 4. Resize observer ────────────────────────────────────────────────
      let depthTexture = makeDepthTexture(
        device,
        canvas.width || 1,
        canvas.height || 1,
        SAMPLE_COUNT,
      );
      let msaaTexture = makeMSAATexture(
        device,
        canvas.width || 1,
        canvas.height || 1,
        format,
      );

      const ro = new ResizeObserver(([e]) => {
        const { width, height } = e.contentRect;
        canvas.width = Math.round(width * devicePixelRatio);
        canvas.height = Math.round(height * devicePixelRatio);
        
        depthTexture.destroy();
        msaaTexture.destroy();
        
        depthTexture = makeDepthTexture(device, canvas.width, canvas.height, SAMPLE_COUNT);
        msaaTexture = makeMSAATexture(device, canvas.width, canvas.height, canvasFormat);
      });
      ro.observe(canvas);

      // ── 5. Load model ─────────────────────────────────────────────────────
      setLoadingMsg("Fetching DamagedHelmet.glb (~3.6 MB)…");
      let model: ParsedModel;
      try {
        model = await loadGlbModel("/models/DamagedHelmet.glb", ac.signal);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(`Model load failed: ${e}`);
        setLoading(false);
        return;
      }
      if (ac.signal.aborted) return;
      setLoadingMsg("Uploading to GPU…");
      const mipGenerator = getMipmapGenerator(device);

      // ── 6. GPU buffers ────────────────────────────────────────────────────
      const VERTEX = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
      const positionBuf = createGpuBuffer(device, model.positions, VERTEX);
      const normalBuf = createGpuBuffer(device, model.normals, VERTEX);
      const texcoordBuf = createGpuBuffer(device, model.texcoords, VERTEX);
      const indexBuf = createGpuBuffer(
        device,
        model.indices,
        GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      );
      const uniformBuf = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const indexFormat: GPUIndexFormat =
        model.indexType === "UNSIGNED_INT" ? "uint32" : "uint16";

      // ── 7. Textures ───────────────────────────────────────────────────────
      const { textures: t } = model;
      const gpuTex = {
        baseColor: t.baseColor
          ? await createTextureFromBitmap(device, t.baseColor, true, mipGenerator)
          : createFallbackTexture(device, 200, 200, 200, true),
        normal: t.normal
          ? await createTextureFromBitmap(device, t.normal, false, mipGenerator)
          : createFallbackTexture(device, 128, 128, 255, false),
        metalRough: t.metallicRoughness
          ? await createTextureFromBitmap(device, t.metallicRoughness, false, mipGenerator)
          : createFallbackTexture(device, 0, 128, 0, false),
        emissive: t.emissive
          ? await createTextureFromBitmap(device, t.emissive, true, mipGenerator)
          : createFallbackTexture(device, 0, 0, 0, true),
        occlusion: t.occlusion
          ? await createTextureFromBitmap(device, t.occlusion, false, mipGenerator)
          : createFallbackTexture(device, 255, 255, 255, false),
      };

      const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
      });

      // ── 8. Shader module ──────────────────────────────────────────────────
      const shaderModule = device.createShaderModule({ code: WGSL_SHADER });
      // Async shader compilation validation (not blocking — errors show in console)
      shaderModule.getCompilationInfo().then((info) => {
        for (const msg of info.messages) {
          if (msg.type === "error") setError(`WGSL error: ${msg.message}`);
        }
      });

      // ── 9. Pipeline ───────────────────────────────────────────────────────
      const pipeline = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: {
          module: shaderModule,
          entryPoint: "vs_main",
          buffers: [
            {
              arrayStride: 12,
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x3" },
              ],
            }, // position
            {
              arrayStride: 12,
              attributes: [
                { shaderLocation: 1, offset: 0, format: "float32x3" },
              ],
            }, // normal
            {
              arrayStride: 8,
              attributes: [
                { shaderLocation: 2, offset: 0, format: "float32x2" },
              ],
            }, // texcoord
          ],
        },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [{ format: canvasFormat }],
        },
        primitive: { topology: "triangle-list", cullMode: "back" },
        multisample: { count: SAMPLE_COUNT },
        depthStencil: {
          format: "depth32float",
          depthWriteEnabled: true,
          depthCompare: "less",
        },
      });

      // ── 10. Bind groups ───────────────────────────────────────────────────
      const bindGroup0 = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: sampler },
        ],
      });

      const bindGroup1 = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: gpuTex.baseColor.createView() },
          { binding: 1, resource: gpuTex.normal.createView() },
          { binding: 2, resource: gpuTex.metalRough.createView() },
          { binding: 3, resource: gpuTex.emissive.createView() },
          { binding: 4, resource: gpuTex.occlusion.createView() },
        ],
      });

      // ── 11. Render loop ───────────────────────────────────────────────────
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
            adapterInfo,
          });
        }

        if (autoRef.current) orbitRef.current.azimuth += 0.004;

        const { azimuth, elevation, radius } = orbitRef.current;
        const eye = sphericalToCartesian(azimuth, elevation, radius);
        const aspect = cvs.width / cvs.height || 1;
        const proj = mat4PerspectiveWebGPU(Math.PI / 4, aspect, 0.1, 100);

        const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
        const modelM = mat4Create();

        // Update uniform buffer with current frame matrices + camera
        writeUniforms(device, uniformBuf, eye, view, proj, modelM);

        // ── Record commands ────────────────────────────────────────────────
        const encoder = device.createCommandEncoder({ label: "frame" });

        const renderPass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: msaaTexture.createView(),
              resolveTarget: ctx.getCurrentTexture().createView(),
              clearValue: { r: 0.04, g: 0.04, b: 0.06, a: 1 },
              loadOp: "clear",
              storeOp: "discard", // Resolve is used, so we can discard MSAA buffer
            },
          ],
          depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup0);
        renderPass.setBindGroup(1, bindGroup1);
        renderPass.setVertexBuffer(0, positionBuf);
        renderPass.setVertexBuffer(1, normalBuf);
        renderPass.setVertexBuffer(2, texcoordBuf);
        renderPass.setIndexBuffer(indexBuf, indexFormat);
        renderPass.drawIndexed(model.indices.length);
        renderPass.end();

        // ── Submit ─────────────────────────────────────────────────────────
        device.queue.submit([encoder.finish()]);
      }

      setLoading(false);
      animFrame = requestAnimationFrame(render);

      // cleanup on unmount
      return () => {
        ro.disconnect();
        depthTexture.destroy();
        msaaTexture.destroy();
      };
    })();

    return () => {
      ac.abort();
      cancelAnimationFrame(animFrame);
    };
  }, []);

  // ── Orbit controls ────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-purple-500/20 bg-[#080a0e]">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080a0e]/95">
            <div className="w-7 h-7 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
            <p className="text-xs text-white/50 font-mono">{loadingMsg}</p>
          </div>
        )}

        {/* Unsupported browser */}
        {unsupported && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#080a0e]/95 p-8">
            <div className="text-4xl">🚧</div>
            <p className="text-sm font-semibold text-white/80">
              WebGPU not supported
            </p>
            <p className="text-xs text-white/40 text-center max-w-xs">
              WebGPU requires Chrome 113+, Edge 113+, or Safari 18+. Firefox
              support is still experimental (enable in about:config).
            </p>
          </div>
        )}

        {/* Error */}
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
              <span className="text-purple-400 font-medium">
                {stats.fps} FPS
              </span>
              <span>{stats.frameMs} ms</span>
              <span className="text-blue-300">
                △ {stats.triangles.toLocaleString()}
              </span>
              <span>∧ {stats.vertices.toLocaleString()}</span>
              <span className="text-yellow-300">D {stats.drawCalls}</span>
            </div>
            {stats.adapterInfo.vendor !== "Unknown" && (
              <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md text-white/40">
                {[stats.adapterInfo.vendor, stats.adapterInfo.architecture]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
        )}

        {/* WebGPU badge */}
        <div className="absolute top-3 right-3 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">
          WebGPU
        </div>

        {!loading && !error && !unsupported && (
          <p className="absolute bottom-3 right-3 text-[10px] text-white/25 font-mono pointer-events-none select-none">
            drag · scroll to zoom
          </p>
        )}
      </div>
    </div>
  );
}
