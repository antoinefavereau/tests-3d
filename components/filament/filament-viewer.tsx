"use client";

import { useEffect, useRef, useState } from "react";
import * as glm from "gl-matrix";
import { sphericalToCartesian, mat4Perspective, mat4LookAt, mat4Create, mat4Scale, mat4Translate } from "../raw-webgl/math";

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

export function FilamentViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 2.5 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    let engine: any;
    let scene: any;
    let view: any;
    let camera: any;
    let renderer: any;
    let swapChain: any;
    let asset: any;
    let loader: any;
    let skybox: any;
    let ibl: any;
    let isDestroyed = false;
    let animId: number;

    const assets = [
      "/models/DamagedHelmet.glb",
      "/models/default_env_ibl.ktx",
      "/models/default_env_skybox.ktx",
    ];

    async function initFilament() {
      // 1. Ensure globals
      (window as any).vec2 = glm.vec2;
      (window as any).vec3 = glm.vec3;
      (window as any).vec4 = glm.vec4;
      (window as any).mat2 = glm.mat2;
      (window as any).mat3 = glm.mat3;
      (window as any).mat4 = glm.mat4;
      (window as any).quat = glm.quat;
      (window as any).glMatrix = glm;

      try {
        if (!(window as any).Filament) {
          const script = document.createElement("script");
          script.src = "/filament/filament.js";
          script.async = true;
          document.head.appendChild(script);
          await new Promise<void>(resolve => script.onload = () => resolve());
        }

        const Filament = (window as any).Filament;
        Filament.init(assets, () => {
          const check = () => {
            if (isDestroyed) return;
            const ready = !!(Filament.Engine && Filament.assets["/models/DamagedHelmet.glb"]);
            if (ready) startApp(Filament);
            else setTimeout(check, 50);
          };
          check();
        });
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    }

    const startApp = (Filament: any) => {
      try {
        engine = Filament.Engine.create(canvasRef.current!);
        scene = engine.createScene();
        view = engine.createView();
        camera = engine.createCamera(Filament.EntityManager.get().create());
        renderer = engine.createRenderer();
        swapChain = engine.createSwapChain();

        view.setCamera(camera);
        view.setScene(scene);

        ibl = engine.createIblFromKtx1(Filament.assets["/models/default_env_ibl.ktx"]);
        skybox = engine.createSkyFromKtx1(Filament.assets["/models/default_env_skybox.ktx"]);
        scene.setSkybox(skybox);
        scene.setIndirectLight(ibl);
        ibl.setIntensity(30000);

        loader = engine.createAssetLoader();
        asset = loader.createAsset(Filament.assets["/models/DamagedHelmet.glb"]);
        
        // Don't wait for loadResources for basic helmet as it's self-contained
        asset.loadResources(() => console.log("Filament: Extras loaded"));

        const box = asset.getBoundingBox();
        const center = [(box.min[0]+box.max[0])/2, (box.min[1]+box.max[1])/2, (box.min[2]+box.max[2])/2];
        const size = Math.max(box.max[0]-box.min[0], box.max[1]-box.min[1], box.max[2]-box.min[2]) || 1;
        const scale = 1.0 / size;

        const transform = Filament.TransformManager.get().getInstance(asset.getRoot());
        const m = mat4Create();
        mat4Scale(m, scale, scale, scale);
        mat4Translate(m, -center[0], -center[1], -center[2]);
        Filament.TransformManager.get().setTransform(transform, m);
        
        scene.addEntities(asset.getEntities());
        setLoading(false);

        const render = () => {
          if (isDestroyed) return;
          animId = requestAnimationFrame(render);

          if (autoRef.current) orbitRef.current.azimuth += 0.005;
          const [ex, ey, ez] = sphericalToCartesian(orbitRef.current.azimuth, orbitRef.current.elevation, orbitRef.current.radius);
          camera.lookAt([ex, ey, ez], [0, 0, 0], [0, 1, 0]);

          const width = containerRef.current!.clientWidth;
          const height = containerRef.current!.clientHeight;
          if (canvasRef.current!.width !== width || canvasRef.current!.height !== height) {
             canvasRef.current!.width = width;
             canvasRef.current!.height = height;
             view.setViewport([0, 0, width, height]);
             camera.setProjectionFov(45, width/height, 0.1, 100, Filament.Camera$Fov.VERTICAL);
          }

          if (renderer.beginFrame(swapChain)) {
            renderer.renderView(view);
            renderer.endFrame();
          }
        };
        render();

      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    };

    initFilament();
    return () => {
      isDestroyed = true;
      if (animId) cancelAnimationFrame(animId);
      // We don't destroy engine here to avoid WASM crashes on quick re-renders
      // Filament handles its own cleanup on canvas loss usually
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="relative flex-1 min-h-[400px] rounded-xl overflow-hidden bg-[#080a0e] ring-1 ring-blue-500/20">
        <div ref={containerRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" 
            onPointerDown={(e) => { dragRef.current={active:true, lastX:e.clientX, lastY:e.clientY}; autoRef.current=false; (e.target as any).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if(!dragRef.current.active) return; orbitRef.current.azimuth -= (e.clientX-dragRef.current.lastX)*0.01; orbitRef.current.elevation = Math.max(-1.2, Math.min(1.2, orbitRef.current.elevation + (e.clientY-dragRef.current.lastY)*0.01)); dragRef.current.lastX=e.clientX; dragRef.current.lastY=e.clientY; }}
            onPointerUp={() => dragRef.current.active=false} />
        </div>
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e] z-10"><div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /></div>}
        {error && <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e] p-4 text-red-500 font-mono text-xs">{error}</div>}
        <div className="absolute top-3 right-3 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none uppercase font-bold">Filament</div>
      </div>
    </div>
  );
}
