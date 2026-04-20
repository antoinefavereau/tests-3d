"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GpuInfo {
  vendor: string;
  renderer: string;
}

interface StatsData {
  fps: number;
  frameMs: number;
  triangles: number;
  vertices: number;
  drawCalls: number;
  gpuInfo: GpuInfo;
}

// ─── Stats Component ──────────────────────────────────────────────────────────

function StatsBridge({ onUpdate }: { onUpdate: (stats: StatsData) => void }) {
  const { gl, scene } = useThree();
  const lastTime = useRef(performance.now());
  const frames = useRef(0);
  const fpsTimer = useRef(0);

  const gpuInfo = useRef<GpuInfo>({ vendor: "Unknown", renderer: "Unknown" });

  useEffect(() => {
    const dbg = gl.getContext().getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      gpuInfo.current = {
        vendor: gl.getContext().getParameter(dbg.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL),
      };
    }
  }, [gl]);

  useFrame((state, delta) => {
    frames.current++;
    fpsTimer.current += delta * 1000;

    if (fpsTimer.current >= 250) {
      const calls = gl.info.render?.calls ?? 0;

      onUpdate({
        fps: Math.round((frames.current * 1000) / fpsTimer.current),
        frameMs: Math.round(delta * 1000 * 10) / 10,
        triangles: gl.info.render?.triangles ?? 0,
        vertices: 0,
        drawCalls: calls,
        gpuInfo: gpuInfo.current,
      });

      frames.current = 0;
      fpsTimer.current = 0;
    }
  });

  return null;
}

// ─── Model Component ──────────────────────────────────────────────────────────

function HelmetModel({
  onLoaded,
}: {
  onLoaded: (stats: { triangles: number; vertices: number }) => void;
}) {
  const { scene } = useGLTF("/models/DamagedHelmet.glb");

  useEffect(() => {
    let t = 0,
      v = 0;
    scene.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        const geometry = mesh.geometry;
        t += geometry.index
          ? geometry.index.count / 3
          : geometry.attributes.position.count / 3;
        v += geometry.attributes.position.count;
      }
    });
    onLoaded({ triangles: t, vertices: v });
  }, [scene, onLoaded]);

  return <primitive object={scene} />;
}

// ─── Viewer Component ─────────────────────────────────────────────────────────

export function R3FViewer() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modelStats, setModelStats] = useState({ triangles: 0, vertices: 0 });

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-pink-500/20 bg-[#080a0e]">
        <Canvas
          shadows
          gl={{
            antialias: true,
            alpha: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.0,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x080a0e, 1);
          }}
        >
          <Suspense fallback={null}>
            <PerspectiveCamera makeDefault position={[0.6, 0.25, 3]} fov={45} />

            <ambientLight intensity={0.1} />

            {/* Key light: top-right-front */}
            <directionalLight
              position={[0.5, 1.0, 0.8]}
              intensity={3.0}
              color="#ffffff"
            />

            {/* Fill light: bottom-left-back */}
            <directionalLight
              position={[-1.0, 0.2, -0.5]}
              intensity={0.8}
              color="#aaccff"
            />

            <HelmetModel onLoaded={setModelStats} />

            <OrbitControls
              makeDefault
              minDistance={1.2}
              maxDistance={8}
              autoRotate
              autoRotateSpeed={0.5}
            />

            <StatsBridge
              onUpdate={(s) =>
                setStats({
                  ...s,
                  triangles: modelStats.triangles,
                  vertices: modelStats.vertices,
                })
              }
            />
          </Suspense>
        </Canvas>

        {/* Loading overlay (Suspense handles it via CSS if we want, but let's use a standard React state if needed) */}
        <Suspense
          fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080a0e]/95">
              <div className="w-7 h-7 border-2 border-pink-500/30 border-t-pink-400 rounded-full animate-spin" />
              <p className="text-xs text-white/50 font-mono">
                Loading R3F Environment...
              </p>
            </div>
          }
        >
          {/* Transparent div to capture click and disable auto-rotate if needed, 
              but OrbitControls handles it automatically on interaction */}
        </Suspense>

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e]/95 p-6">
            <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap text-center">
              {error}
            </pre>
          </div>
        )}

        {/* Stats HUD */}
        {stats && (
          <div className="absolute top-3 left-3 flex flex-col gap-1 font-mono text-[11px] select-none pointer-events-none">
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-md text-white/75">
              <span className="text-pink-400 font-medium">{stats.fps} FPS</span>
              <span>{stats.frameMs} ms</span>
              <span className="text-rose-300">
                △ {(stats.triangles ?? 0).toLocaleString()}
              </span>
              <span>∧ {(stats.vertices ?? 0).toLocaleString()}</span>
              <span className="text-yellow-300">D {stats.drawCalls ?? 0}</span>
            </div>
            {stats.gpuInfo.renderer !== "Unknown" && (
              <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md text-white/40 truncate max-w-sm">
                {stats.gpuInfo.renderer.replace(/\(.*?\)/g, "").trim()}
              </div>
            )}
          </div>
        )}

        {/* Techno badge */}
        <div className="absolute top-3 right-3 bg-pink-500/20 border border-pink-500/30 text-pink-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">
          R3F
        </div>

        {/* Hint */}
        <p className="absolute bottom-3 right-3 text-[10px] text-white/25 font-mono pointer-events-none select-none">
          drag · scroll to zoom
        </p>
      </div>
    </div>
  );
}

// Preload the model
useGLTF.preload("/models/DamagedHelmet.glb");
