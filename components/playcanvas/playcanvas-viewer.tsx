"use client";

import { useEffect, useRef, useState } from "react";
import * as pc from "playcanvas";
import { sphericalToCartesian } from "../raw-webgl/math";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  fps: number;
  frameMs: number;
  triangles: number;
  vertices: number;
  drawCalls: number;
  gpuInfo: { vendor: string; renderer: string };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlaycanvasViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<pc.Application | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initialising PlayCanvas…");
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 3.0 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let app: pc.Application;

    const init = async () => {
      try {
        // 1. Create Graphics Device (Modern ESM approach)
        const deviceOptions = {
          deviceTypes: ["webgpu", "webgl2"],
          glslangUrl:
            "https://unpkg.com/@webgpu/glslang@0.0.15/dist/web-devel/glslang.js",
          twgslUrl: "https://unpkg.com/twgsl@0.0.2/dist/twgsl.js",
          antialias: true,
          alpha: true,
        };

        const device = await pc.createGraphicsDevice(canvas, deviceOptions);

        // 2. Create Application
        app = new pc.Application(canvas, {
          graphicsDevice: device,
          mouse: new pc.Mouse(canvas),
          touch: new pc.TouchDevice(canvas),
        });
        appRef.current = app;

        app.setCanvasFillMode(pc.FILLMODE_NONE);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);

        // 3. Register standard resource handlers
        app.loader.addHandler("json", new pc.JsonHandler(app));
        app.loader.addHandler("texture", new pc.TextureHandler(app));
        app.loader.addHandler("container", new pc.ContainerHandler(app));

        // 4. Default Layers (Crucial!)
        // Without these, nothing rendered in a scene created from scratch via AppBase/Application
        const layerComposition = new pc.LayerComposition();
        const worldLayer = new pc.Layer({ name: "World" });
        layerComposition.push(worldLayer);
        app.scene.layers = layerComposition;

        // 5. Hierarchy
        // Camera
        const cameraEntity = new pc.Entity("camera");
        cameraEntity.addComponent("camera", {
          clearColor: new pc.Color(0.03, 0.03, 0.05, 1),
          fov: 45,
          layers: [worldLayer.id],
        });
        app.root.addChild(cameraEntity);

        // Lights
        const keyLight = new pc.Entity("keyLight");
        keyLight.addComponent("light", {
          type: "directional",
          color: new pc.Color(1, 1, 1),
          intensity: 3.0,
          layers: [worldLayer.id],
        });
        keyLight.setEulerAngles(45, 45, 0);
        app.root.addChild(keyLight);

        const fillLight = new pc.Entity("fillLight");
        fillLight.addComponent("light", {
          type: "directional",
          color: new pc.Color(0.6, 0.8, 1),
          intensity: 0.8,
          layers: [worldLayer.id],
        });
        fillLight.setEulerAngles(-20, -135, 0);
        app.root.addChild(fillLight);

        // 6. Loader
        setLoadingMsg("Fetching DamagedHelmet.glb (~3.6 MB)…");
        app.assets.loadFromUrl(
          "/models/DamagedHelmet.glb",
          "container",
          (err, asset) => {
            if (err) {
              setError(`Failed to load model: ${err}`);
              setLoading(false);
              return;
            }

            const modelEntity = (
              asset!.resource as any
            ).instantiateRenderEntity({
              layers: [worldLayer.id],
            });
            modelEntity.name = "helmet";
            app.root.addChild(modelEntity);
            setLoading(false);
          },
        );

        app.start();

        // 7. Stats Loop
        let lastTime = performance.now();
        const fpsSamples: number[] = [];
        let fpsTimer = 0;

        app.on("update", (dt) => {
          const now = performance.now();
          const actualDt = now - lastTime;
          lastTime = now;

          fpsSamples.push(1000 / (actualDt || 16.67));
          if (fpsSamples.length > 30) fpsSamples.shift();
          fpsTimer += actualDt;

          if (fpsTimer >= 250) {
            fpsTimer = 0;
            const avgFps =
              fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
            const pcStats = app.stats as any;

            setStats({
              fps: Math.round(avgFps),
              frameMs: Math.round(actualDt * 10) / 10,
              triangles: pcStats.triangles ?? 0,
              vertices: pcStats.vertices ?? 0,
              drawCalls: pcStats.drawCalls?.total ?? 0,
              gpuInfo: {
                vendor: (device as any).unmaskedVendor || "Generic",
                renderer: (device as any).unmaskedRenderer || "Generic",
              },
            });
          }

          if (autoRef.current) orbitRef.current.azimuth += 0.004;
          const { azimuth, elevation, radius } = orbitRef.current;
          const [ex, ey, ez] = sphericalToCartesian(azimuth, elevation, radius);
          cameraEntity.setPosition(ex, ey, ez);
          cameraEntity.lookAt(pc.Vec3.ZERO);
        });
      } catch (err: any) {
        setError(`Failed to init PlayCanvas: ${err.message}`);
        setLoading(false);
      }
    };

    init();

    const ro = new ResizeObserver(() => {
      app?.resizeCanvas();
    });
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      app?.destroy();
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
      Math.min(8, orbitRef.current.radius + e.deltaY * 0.005),
    );
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-red-500/20 bg-[#080a0e]">
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
            <div className="w-7 h-7 border-2 border-red-500/30 border-t-red-400 rounded-full animate-spin" />
            <p className="text-xs text-white/50 font-mono">{loadingMsg}</p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e]/95 p-6 z-10">
            <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap text-center">
              {error}
            </pre>
          </div>
        )}

        {/* Stats HUD */}
        {stats && !loading && (
          <div className="absolute top-3 left-3 flex flex-col gap-1 font-mono text-[11px] select-none pointer-events-none">
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-md text-white/75">
              <span className="text-red-400 font-medium">{stats.fps} FPS</span>
              <span>{stats.frameMs} ms</span>
              <span className="text-orange-300">
                △ {stats.triangles.toLocaleString()}
              </span>
              <span>∧ {stats.vertices.toLocaleString()}</span>
              <span className="text-yellow-300">D {stats.drawCalls}</span>
            </div>
            {stats.gpuInfo.renderer !== "Generic" && (
              <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md text-white/40 truncate max-w-sm">
                {stats.gpuInfo.renderer.replace(/\(.*?\)/g, "").trim()}
              </div>
            )}
          </div>
        )}

        {/* Techno badge */}
        <div className="absolute top-3 right-3 bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">
          PlayCanvas
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
