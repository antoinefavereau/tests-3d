"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Camera, Transform, Program, Mesh, GLTFLoader } from "ogl";
import { sphericalToCartesian } from "../raw-webgl/math";

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

// ─── Component ────────────────────────────────────────────────────────────────

export function OglViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initialising OGL…");
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 3.0 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Renderer & Camera Setup ───────────────────────────────────────────────
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    const renderer = new Renderer({
      canvas,
      antialias: true,
      alpha: true,
      dpr,
      preserveDrawingBuffer: true,
    });
    rendererRef.current = renderer;
    const gl = renderer.gl;

    const camera = new Camera(gl, { fov: 45 });
    const scene = new Transform();

    // ── Loader ────────────────────────────────────────────────────────────────
    setLoadingMsg("Fetching DamagedHelmet.glb (~3.6 MB)…");

    // ── Shaders ──────────────────────────────────────────────────────────────
    const vertex = /* glsl */ `
        attribute vec3 position;
        attribute vec2 uv;
        attribute vec3 normal;

        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform mat3 normalMatrix;

        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragment = /* glsl */ `
        precision highp float;
        uniform sampler2D tBaseColor;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
            vec4 tex = texture2D(tBaseColor, vUv);
            // Simple diffuse lighting
            float lighting = max(0.3, dot(vNormal, normalize(vec3(1, 1, 1))));
            gl_FragColor = vec4(tex.rgb * lighting, tex.a);
        }
    `;

    async function loadModel() {
      try {
        const gltf = await GLTFLoader.load(gl, "/models/DamagedHelmet.glb");
        const model = gltf.scene[0];

        // Replace default NormalProgram with our textured one
        model.traverse((node: any) => {
          if (node instanceof Mesh) {
            const material = node.program.gltfMaterial;
            if (material && material.baseColorTexture) {
              node.program = new Program(gl, {
                vertex,
                fragment,
                uniforms: {
                  tBaseColor: { value: material.baseColorTexture.texture },
                },
              });
            }
          }
        });

        model.setParent(scene);
        setLoading(false);
      } catch (err: any) {
        setError(`Failed to load model: ${err.message}`);
        setLoading(false);
      }
    }

    loadModel();

    // ── Animation Loop ────────────────────────────────────────────────────────
    let lastTime = performance.now();
    const fpsSamples: number[] = [];
    let fpsTimer = 0;
    let requestId: number;

    const update = (time: number) => {
      requestId = requestAnimationFrame(update);

      const dt = time - lastTime;
      lastTime = time;

      fpsSamples.push(1000 / (dt || 16.67));
      if (fpsSamples.length > 30) fpsSamples.shift();
      fpsTimer += dt;

      if (fpsTimer >= 250) {
        fpsTimer = 0;
        const avgFps =
          fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;

        let triangles = 0;
        let vertices = 0;
        let drawCalls = 0;

        scene.traverse((node: any) => {
          if (node instanceof Mesh) {
            drawCalls++;
            const geometry = node.geometry;
            if (geometry.attributes.index) {
              triangles += geometry.attributes.index.data.length / 3;
            } else if (geometry.attributes.position) {
              triangles += geometry.attributes.position.data.length / 9;
            }
            if (geometry.attributes.position) {
              vertices += geometry.attributes.position.data.length / 3;
            }
          }
        });

        setStats({
          fps: Math.round(avgFps),
          frameMs: Math.round(dt * 10) / 10,
          triangles,
          vertices,
          drawCalls,
          gpuInfo: {
            vendor: gl.getParameter(gl.VENDOR),
            renderer: gl.getParameter(gl.RENDERER),
          },
        });
      }

      if (autoRef.current) orbitRef.current.azimuth += 0.004;

      const { azimuth, elevation, radius } = orbitRef.current;
      const [ex, ey, ez] = sphericalToCartesian(azimuth, elevation, radius);

      camera.position.set(ex, ey, ez);
      camera.lookAt([0, 0, 0]);

      renderer.render({ scene, camera });
    };

    requestId = requestAnimationFrame(update);

    // ── Resize ────────────────────────────────────────────────────────────────
    // Using ResizeObserver on the PARENT container to avoid infinite loops and get accurate size
    const ro = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        renderer.setSize(width, height);
        camera.perspective({ aspect: width / height });
      }
    });

    const parent = canvas.parentElement;
    if (parent) ro.observe(parent);

    return () => {
      cancelAnimationFrame(requestId);
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
  const onPointerUp = () => (dragRef.current.active = false);
  const onWheel = (e: React.WheelEvent) => {
    orbitRef.current.radius = Math.max(
      1.2,
      Math.min(10, orbitRef.current.radius + e.deltaY * 0.005),
    );
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="relative flex-1 min-h-[400px] rounded-xl overflow-hidden ring-1 ring-purple-500/20 bg-[#080a0e]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full outline-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080a0e]/95 z-20">
            <div className="w-7 h-7 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
            <p className="text-xs text-white/50 font-mono">{loadingMsg}</p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e]/95 p-6 z-20">
            <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap text-center">
              {error}
            </pre>
          </div>
        )}

        {/* Stats HUD */}
        {stats && !loading && (
          <div className="absolute top-3 left-3 flex flex-col gap-1 font-mono text-[11px] select-none pointer-events-none z-10">
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-md text-white/75">
              <span className="text-purple-400 font-medium">
                {stats.fps} FPS
              </span>
              <span>{stats.frameMs} ms</span>
              <span className="text-orange-300">
                △ {stats.triangles.toLocaleString()}
              </span>
              <span>∧ {stats.vertices.toLocaleString()}</span>
              <span className="text-yellow-300">D {stats.drawCalls}</span>
            </div>
          </div>
        )}

        {/* Techno badge */}
        <div className="absolute top-3 right-3 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none z-10">
          OGL
        </div>

        {/* Hint */}
        {!loading && !error && (
          <p className="absolute bottom-3 right-3 text-[10px] text-white/25 font-mono pointer-events-none select-none z-10">
            drag · scroll to zoom
          </p>
        )}
      </div>
    </div>
  );
}
