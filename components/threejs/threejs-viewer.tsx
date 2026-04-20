"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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

export function ThreejsViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initialising Three.js…");
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 3.0 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // ── Scene Setup ───────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // GPU info
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpuInfo: GpuInfo = dbg
      ? {
          vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
        }
      : { vendor: "Unknown", renderer: "Unknown" };

    // ── Lights ───────────────────────────────────────────────────────────────
    // Key light: top-right-front (matching WebGL/WebGPU implementation)
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
    keyLight.position.set(0.5, 1.0, 0.8);
    scene.add(keyLight);

    // Fill light: bottom-left-back
    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.8);
    fillLight.position.set(-1.0, 0.2, -0.5);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambientLight);

    // ── Loader ───────────────────────────────────────────────────────────────
    const loader = new GLTFLoader();
    let modelStats = { triangles: 0, vertices: 0 };

    setLoadingMsg("Fetching DamagedHelmet.glb (~3.6 MB)…");

    loader.load(
      "/models/DamagedHelmet.glb",
      (gltf) => {
        scene.add(gltf.scene);

        // Compute stats
        gltf.scene.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            const geometry = mesh.geometry;
            modelStats.triangles += geometry.index
              ? geometry.index.count / 3
              : geometry.attributes.position.count / 3;
            modelStats.vertices += geometry.attributes.position.count;
          }
        });

        setLoading(false);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const percent = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadingMsg(`Loading model: ${percent}%`);
        }
      },
      (err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to load model: ${message}`);
        setLoading(false);
      },
    );

    // ── Resize Handler ───────────────────────────────────────────────────────
    const handleResize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    handleResize();

    // ── Animation Loop ──────────────────────────────────────────────────────
    const timer = new THREE.Timer();
    const fpsSamples: number[] = [];
    let fpsTimer = 0;
    let animFrame = 0;

    const animate = (time: number) => {
      animFrame = requestAnimationFrame(animate);

      timer.update(time);
      const dt = timer.getDelta() * 1000;

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
          triangles: modelStats.triangles,
          vertices: modelStats.vertices,
          drawCalls: renderer.info.render.calls,
          gpuInfo,
        });
      }

      if (autoRef.current) orbitRef.current.azimuth += 0.004;

      const { azimuth, elevation, radius } = orbitRef.current;
      const [ex, ey, ez] = sphericalToCartesian(azimuth, elevation, radius);
      camera.position.set(ex, ey, ez);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrame);
      ro.disconnect();
      renderer.dispose();
      scene.clear();
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

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div
        ref={containerRef}
        className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-blue-500/20 bg-[#080a0e]"
      >
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
            <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
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
              <span className="text-blue-400 font-medium">{stats.fps} FPS</span>
              <span>{stats.frameMs} ms</span>
              <span className="text-cyan-300">
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

        {/* Techno badge */}
        <div className="absolute top-3 right-3 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">
          Three.js
        </div>

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
