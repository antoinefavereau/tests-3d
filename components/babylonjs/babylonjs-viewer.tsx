"use client";

import { useEffect, useRef, useState } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  SceneLoader,
  Color4,
  SceneInstrumentation,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
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

export function BabylonjsViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initialising Babylon.js…");
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 3.0 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Engine & Scene Setup ──────────────────────────────────────────────────
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.03, 0.03, 0.05, 1);

    const instrumentation = new SceneInstrumentation(scene);

    // Camera setup - we use ArcRotate but manually control it like the others
    const camera = new ArcRotateCamera(
      "camera",
      0,
      0,
      3,
      Vector3.Zero(),
      scene,
    );
    camera.attachControl(canvas, false); // Just to have it, we override behavior
    camera.minZ = 0.1;
    camera.maxZ = 100;
    camera.fov = 0.8; // similar to 45 deg

    // GPU info
    const caps = engine.getCaps();
    const gpuInfo: GpuInfo = {
      vendor: "Generic",
      renderer: caps.parallelShaderCompile
        ? "DirectX/OpenGL/WebGPU"
        : "Software/Fallback",
    };
    // Note: Babylon hides low level GL info more than Three, but we can try to get it if needed.
    // We'll keep it simple for now to avoid complexity in this demo.

    // ── Lights ────────────────────────────────────────────────────────────────
    // Key light
    const keyLight = new DirectionalLight(
      "keyLight",
      new Vector3(-0.5, -1.0, -0.8),
      scene,
    );
    keyLight.intensity = 3.0;

    // Fill light
    const fillLight = new DirectionalLight(
      "fillLight",
      new Vector3(1.0, -0.2, 0.5),
      scene,
    );
    fillLight.intensity = 0.8;

    const ambient = new HemisphericLight(
      "ambient",
      new Vector3(0, 1, 0),
      scene,
    );
    ambient.intensity = 0.2;

    // ── Loader ────────────────────────────────────────────────────────────────
    setLoadingMsg("Fetching DamagedHelmet.glb (~3.6 MB)…");

    SceneLoader.ImportMesh(
      "",
      "/models/",
      "DamagedHelmet.glb",
      scene,
      (meshes) => {
        setLoading(false);
        // Babylon GLB rotation correction is automatic usually,
        // but we might need to adjust based on scene orientation.
      },
      (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.round((evt.loaded / evt.total) * 100);
          setLoadingMsg(`Loading model: ${percent}%`);
        }
      },
      (scene, message) => {
        setError(`Failed to load model: ${message}`);
        setLoading(false);
      },
    );

    // ── Resize ────────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      engine.resize();
    });
    ro.observe(canvas);

    // ── Render Loop ───────────────────────────────────────────────────────────
    let lastTime = performance.now();
    const fpsSamples: number[] = [];
    let fpsTimer = 0;

    engine.runRenderLoop(() => {
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

        // Count total triangles and vertices across all meshes manually for robustness
        let totalTriangles = 0;
        let totalVertices = 0;
        scene.meshes.forEach((m) => {
          totalTriangles += m.getTotalIndices() / 3;
          totalVertices += m.getTotalVertices();
        });

        setStats({
          fps: Math.round(avgFps),
          frameMs: Math.round(dt * 10) / 10,
          triangles: totalTriangles,
          vertices: totalVertices,
          drawCalls: instrumentation.drawCallsCounter.current,
          gpuInfo,
        });
      }

      if (autoRef.current) orbitRef.current.azimuth += 0.004;

      const { azimuth, elevation, radius } = orbitRef.current;
      const [ex, ey, ez] = sphericalToCartesian(azimuth, elevation, radius);

      camera.setPosition(new Vector3(ex, ey, ez));
      camera.setTarget(Vector3.Zero());

      scene.render();
    });

    return () => {
      ro.disconnect();
      engine.dispose();
    };
  }, []);

  // ── Orbit controls ───────────────────────────────────────────────────────────
  // We disable the default Babylon controls to use our shared consistent logic
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
    orbitRef.current.azimuth += dx * 0.008;
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
      <div className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-blue-500/20 bg-[#080a0e]">
        <canvas
          ref={canvasRef}
          className="w-full h-full outline-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080a0e]/95">
            <div className="w-7 h-7 border-2 border-orange-500/30 border-t-orange-400 rounded-full animate-spin" />
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
              <span className="text-orange-400 font-medium">
                {stats.fps} FPS
              </span>
              <span>{stats.frameMs} ms</span>
              <span className="text-blue-300">
                △ {stats.triangles.toLocaleString()}
              </span>
              <span>∧ {stats.vertices.toLocaleString()}</span>
              <span className="text-yellow-300">
                D {Math.round(stats.drawCalls)}
              </span>
            </div>
            {stats.gpuInfo.renderer !== "Unknown" && (
              <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md text-white/40 truncate max-w-sm">
                {stats.gpuInfo.renderer}
              </div>
            )}
          </div>
        )}

        {/* Techno badge */}
        <div className="absolute top-3 right-3 bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">
          Babylon.js
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
