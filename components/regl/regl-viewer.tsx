"use client";

import { useEffect, useRef, useState } from "react";
import createRegl from "regl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  sphericalToCartesian,
  mat4Perspective,
  mat4LookAt,
} from "../raw-webgl/math";

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

export function ReglViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initialising Regl…");
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 2.5 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const regl = createRegl({
      canvas,
      attributes: { antialias: true, alpha: true, preserveDrawingBuffer: true },
    });

    let drawCommand: any = null;
    let modelStats = { triangles: 0, vertices: 0, drawCalls: 0 };

    async function init() {
      try {
        setLoadingMsg("Three.js: Destructuring GLTF…");
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync("/models/DamagedHelmet.glb");

        let mesh: any = null;
        gltf.scene.traverse((node: any) => {
          if (node.isMesh && !mesh) mesh = node;
        });

        if (!mesh) throw new Error("No mesh found");

        // Convert to NON-INDEXED to avoid index buffer issues
        let geometry = mesh.geometry;
        if (geometry.index) {
          geometry = geometry.toNonIndexed();
        }

        const posData = new Float32Array(geometry.attributes.position.array);
        const normData = geometry.attributes.normal?.array;
        const uvData = geometry.attributes.uv?.array;

        // --- Normalization ---
        let minX = Infinity,
          minY = Infinity,
          minZ = Infinity;
        let maxX = -Infinity,
          maxY = -Infinity,
          maxZ = -Infinity;
        for (let i = 0; i < posData.length; i += 3) {
          minX = Math.min(minX, posData[i]);
          minY = Math.min(minY, posData[i + 1]);
          minZ = Math.min(minZ, posData[i + 2]);
          maxX = Math.max(maxX, posData[i]);
          maxY = Math.max(maxY, posData[i + 1]);
          maxZ = Math.max(maxZ, posData[i + 2]);
        }
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const scale = size > 0 ? 1.5 / size : 1.0;
        for (let i = 0; i < posData.length; i += 3) {
          const px = (posData[i] - centerX) * scale;
          const py = (posData[i + 1] - centerY) * scale;
          const pz = (posData[i + 2] - centerZ) * scale;

          // Corrected Rotation: y -> -z, z -> y
          posData[i] = px;
          posData[i + 1] = -pz;
          posData[i + 2] = py;
        }

        if (normData) {
          for (let i = 0; i < normData.length; i += 3) {
            const ny = normData[i + 1];
            const nz = normData[i + 2];
            normData[i + 1] = -nz;
            normData[i + 2] = ny;
          }
        }

        modelStats.vertices = posData.length / 3;
        modelStats.triangles = modelStats.vertices / 3;
        modelStats.drawCalls = 1;

        // Texture extraction with Canvas fallback for stability
        let baseColorTexture = regl.texture([[255, 255, 255, 255]]);
        if (mesh.material && mesh.material.map && mesh.material.map.image) {
          const img = mesh.material.map.image;
          const texCanvas = document.createElement("canvas");
          texCanvas.width = img.width;
          texCanvas.height = img.height;
          const ctx = texCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            baseColorTexture = regl.texture({
              data: texCanvas,
              flipY: false,
              min: "linear",
              mag: "linear",
              wrapS: "repeat",
              wrapT: "repeat",
            });
          }
        }

        drawCommand = regl({
          vert: `
            precision highp float;
            attribute vec3 position, normal;
            attribute vec2 uv;
            varying vec2 vUv;
            varying vec3 vNormal;
            uniform mat4 projection, view;
            void main() {
              vUv = uv;
              vNormal = normal;
              gl_Position = projection * view * vec4(position, 1.0);
            }
          `,
          frag: `
            precision highp float;
            varying vec2 vUv;
            varying vec3 vNormal;
            uniform sampler2D tBaseColor;
            void main() {
              vec4 color = texture2D(tBaseColor, vUv);
              float lighting = max(0.3, abs(vNormal.z)); 
              gl_FragColor = vec4(color.rgb * lighting, color.a);
            }
          `,
          attributes: {
            position: regl.buffer(posData),
            normal: regl.buffer(
              normData
                ? new Float32Array(normData)
                : new Float32Array(posData.length).fill(0),
            ),
            uv: regl.buffer(
              uvData
                ? new Float32Array(uvData)
                : new Float32Array((posData.length / 3) * 2).fill(0),
            ),
          },
          // NO ELEMENTS (avoiding the bug)
          count: modelStats.vertices,
          uniforms: {
            projection: ({ viewportWidth, viewportHeight }) =>
              mat4Perspective(
                Math.PI / 4,
                viewportWidth / viewportHeight,
                0.1,
                1000,
              ),
            view: (context, props: any) => props.viewMatrix,
            tBaseColor: baseColorTexture,
          },
          depth: { enable: true },
          cull: { enable: true },
        });

        setLoading(false);
      } catch (err: any) {
        setError(`Failed to init Regl: ${err.message}`);
        setLoadingMsg("");
        setLoading(false);
      }
    }

    init();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvas.width = width * window.devicePixelRatio;
          canvas.height = height * window.devicePixelRatio;
        }
      }
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let lastTime = performance.now();
    const fpsSamples: number[] = [];
    let fpsTimer = 0;

    const frame = regl.frame(() => {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;

      fpsSamples.push(1000 / (dt || 16.67));
      if (fpsSamples.length > 30) fpsSamples.shift();
      fpsTimer += dt;

      if (fpsTimer >= 250) {
        fpsTimer = 0;
        const avgFps =
          fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
        setStats({
          fps: Math.round(avgFps),
          frameMs: Math.round(dt * 10) / 10,
          ...modelStats,
          gpuInfo: {
            vendor: regl._gl.getParameter(regl._gl.VENDOR),
            renderer: regl._gl.getParameter(regl._gl.RENDERER),
          },
        });
      }

      if (autoRef.current) orbitRef.current.azimuth += 0.004;
      const { azimuth, elevation, radius } = orbitRef.current;
      const [ex, ey, ez] = sphericalToCartesian(azimuth, elevation, radius);

      const viewMatrix = mat4LookAt([ex, ey, ez], [0, 0, 0], [0, 1, 0]);

      regl.clear({ color: [0.03, 0.04, 0.06, 1], depth: 1 });

      if (drawCommand) {
        drawCommand({ viewMatrix });
      }
    });

    return () => {
      frame.cancel();
      ro.disconnect();
      regl.destroy();
    };
  }, []);

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
  const onPointerUp = () => (dragRef.current.active = false);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="relative flex-1 min-h-[400px] rounded-xl overflow-hidden ring-1 ring-teal-500/20 bg-[#080a0e]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full outline-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080a0e]/95 z-20">
            <div className="w-7 h-7 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
            <p className="text-xs text-white/50 font-mono text-center px-10">
              {loadingMsg}
            </p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e]/95 p-6 z-20">
            <pre className="text-xs text-red-400 font-mono text-center">
              {error}
            </pre>
          </div>
        )}
        {stats && !loading && (
          <div className="absolute top-3 left-3 flex flex-col gap-1 font-mono text-[11px] select-none pointer-events-none z-10">
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-md text-white/75">
              <span className="text-teal-400 font-medium">{stats.fps} FPS</span>
              <span>{stats.frameMs} ms</span>
              <span className="text-orange-300">
                △ {stats.triangles.toLocaleString()}
              </span>
              <span>∧ {stats.vertices.toLocaleString()}</span>
            </div>
          </div>
        )}
        <div className="absolute top-3 right-3 bg-teal-500/20 border border-teal-500/30 text-teal-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none z-10">
          REGL
        </div>
      </div>
    </div>
  );
}
