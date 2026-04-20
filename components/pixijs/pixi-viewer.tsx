"use client";

import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  sphericalToCartesian,
  mat4Perspective,
  mat4LookAt,
} from "../raw-webgl/math";

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

export function PixiViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const orbitRef = useRef({ azimuth: 0.6, elevation: 0.25, radius: 2.5 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRef = useRef(true);

  useEffect(() => {
    if (!containerRef.current) return;

    let renderer: PIXI.Renderer | null = null;
    let ticker: PIXI.Ticker | null = null;
    let stage: PIXI.Container | null = null;
    let isDestroyed = false;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      try {
        // BARE METAL approach: Avoid PIXI.Application and its ResizePlugin bug
        renderer = (await PIXI.autoDetectRenderer({
          width: containerRef.current!.clientWidth,
          height: containerRef.current!.clientHeight,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          backgroundAlpha: 0,
        })) as PIXI.Renderer;

        if (isDestroyed) {
          renderer.destroy();
          return;
        }

        containerRef.current!.appendChild(renderer.canvas);
        stage = new PIXI.Container();

        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (renderer && !isDestroyed) renderer.resize(width, height);
          }
        });
        resizeObserver.observe(containerRef.current!);

        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync("/models/DamagedHelmet.glb");

        const meshes: any[] = [];
        gltf.scene.traverse((node: any) => {
          if (node.isMesh) meshes.push(node);
        });

        if (meshes.length === 0) throw new Error("No meshes found");

        let minX = Infinity,
          minY = Infinity,
          minZ = Infinity;
        let maxX = -Infinity,
          maxY = -Infinity,
          maxZ = -Infinity;
        meshes.forEach((mesh) => {
          const pos = mesh.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            minX = Math.min(minX, pos.getX(i));
            minY = Math.min(minY, pos.getY(i));
            minZ = Math.min(minZ, pos.getZ(i));
            maxX = Math.max(maxX, pos.getX(i));
            maxY = Math.max(maxY, pos.getY(i));
            maxZ = Math.max(maxZ, pos.getZ(i));
          }
        });
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const totalSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const globalScale = totalSize > 0 ? 1.5 / totalSize : 1.0;

        const vertexShader = `
          precision highp float;
          attribute vec3 aPosition;
          attribute vec3 aNormal;
          attribute vec2 aUV;
          varying vec2 vUv;
          varying vec3 vNormal;
          uniform mat4 uProjection;
          uniform mat4 uView;
          void main() {
            vUv = aUV;
            vNormal = aNormal;
            gl_Position = uProjection * uView * vec4(aPosition, 1.0);
          }
        `;

        const fragmentShader = `
          precision highp float;
          varying vec2 vUv;
          varying vec3 vNormal;
          uniform sampler2D uTexture;
          void main() {
            vec4 color = texture2D(uTexture, vUv);
            vec3 normal = normalize(vNormal);
            float shadow = normal.z * 0.5 + 0.5;
            float lighting = mix(0.3, 1.0, shadow);
            gl_FragColor = vec4(color.rgb * lighting, color.a);
          }
        `;

        let totalTriangles = 0;
        let totalVertices = 0;
        let helmetTexture: PIXI.Texture<any> | null = null;

        for (const mesh of meshes) {
          if (!helmetTexture && mesh.material?.map?.image) {
            const img = mesh.material.map.image;
            const source = new PIXI.ImageSource({
              resource: img,
              autoGenerateMipmaps: true,
              scaleMode: "linear",
              addressMode: "repeat",
            });
            helmetTexture = new PIXI.Texture({ source });
          }

          let geometry = mesh.geometry;
          if (geometry.index) geometry = geometry.toNonIndexed();
          const count = geometry.attributes.position.count;
          const posData = new Float32Array(count * 3);
          const normData = new Float32Array(count * 3);
          const uvData = new Float32Array(count * 2);
          const posAttr = geometry.attributes.position;
          const normAttr = geometry.attributes.normal;
          const uvAttr = geometry.attributes.uv;

          for (let i = 0; i < count; i++) {
            const px = (posAttr.getX(i) - centerX) * globalScale;
            const py = (posAttr.getY(i) - centerY) * globalScale;
            const pz = (posAttr.getZ(i) - centerZ) * globalScale;
            posData[i * 3] = px;
            posData[i * 3 + 1] = -pz;
            posData[i * 3 + 2] = py;
            if (normAttr) {
              const nx = normAttr.getX(i);
              const ny = normAttr.getY(i);
              const nz = normAttr.getZ(i);
              normData[i * 3] = nx;
              normData[i * 3 + 1] = -nz;
              normData[i * 3 + 2] = ny;
            }
            if (uvAttr) {
              let u = uvAttr.getX(i);
              let v = uvAttr.getY(i);
              if (Math.abs(u) > 10.0 || Math.abs(v) > 10.0) {
                u /= 65535.0;
                v /= 65535.0;
              }
              uvData[i * 2] = u;
              uvData[i * 2 + 1] = v;
            }
          }

          const pixiGeometry = new PIXI.Geometry({
            attributes: {
              aPosition: { buffer: posData, size: 3 },
              aNormal: { buffer: normData, size: 3 },
              aUV: { buffer: uvData, size: 2 },
            },
          });

          const shader = PIXI.Shader.from({
            gl: { vertex: vertexShader, fragment: fragmentShader },
            resources: {
              uUniforms: new PIXI.UniformGroup({
                uProjection: {
                  value: new Float32Array(16),
                  type: "mat4x4<f32>",
                },
                uView: { value: new Float32Array(16), type: "mat4x4<f32>" },
              }),
              uTexture: (helmetTexture || PIXI.Texture.WHITE).source,
            },
          });

          const pixiMesh = new PIXI.Mesh({ geometry: pixiGeometry, shader });
          pixiMesh.state.depthTest = true;
          pixiMesh.state.cullMode = "back";
          stage.addChild(pixiMesh);
          totalTriangles += count / 3;
          totalVertices += count;
        }

        ticker = new PIXI.Ticker();
        let lastTime = performance.now();
        const fpsSamples: number[] = [];
        let fpsTimer = 0;

        ticker.add(() => {
          if (!renderer || !stage) return;
          const now = performance.now();
          const dt = now - lastTime || 16.67;
          lastTime = now;
          if (autoRef.current) orbitRef.current.azimuth += 0.004;
          const { azimuth, elevation, radius } = orbitRef.current;
          const [ex, ey, ez] = sphericalToCartesian(azimuth, elevation, radius);
          const projMatrix = mat4Perspective(
            Math.PI / 4,
            renderer.width / renderer.height,
            0.1,
            1000,
          );
          const viewMatrix = mat4LookAt([ex, ey, ez], [0, 0, 0], [0, 1, 0]);

          stage.children.forEach((child: any) => {
            if (child.shader && child.shader.resources.uUniforms) {
              child.shader.resources.uUniforms.uniforms.uProjection =
                projMatrix;
              child.shader.resources.uUniforms.uniforms.uView = viewMatrix;
            }
          });

          renderer.render(stage);

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
              triangles: Math.round(totalTriangles),
              vertices: Math.round(totalVertices),
              drawCalls: meshes.length,
              gpuInfo: {
                vendor: "WebGL/WebGPU",
                renderer: String(renderer?.type || "Unknown").toUpperCase(),
              },
            });
          }
        });
        ticker.start();
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(`PixiJS v8 Error: ${err.message}`);
        setLoading(false);
      }
    }

    init();

    return () => {
      isDestroyed = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (ticker) {
        ticker.stop();
        ticker.destroy();
      }
      if (stage) {
        stage.destroy({ children: true, texture: true, textureSource: true });
      }
      if (renderer) {
        renderer.destroy();
      }
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
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full outline-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080a0e]/95 z-20">
            <div className="w-7 h-7 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
            <p className="text-xs text-white/50 font-mono italic text-center px-10">
              Initialising PixiJS v8 Benchmark…
            </p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080a0e]/95 p-6 z-20 text-center text-red-400 font-mono text-xs">
            {error}
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
            <div className="bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-md text-white/40 text-[9px] mt-1 border border-white/5 uppercase tracking-wider">
              {stats.gpuInfo.renderer}
            </div>
          </div>
        )}
        <div className="absolute top-3 right-3 bg-teal-500/20 border border-teal-500/30 text-teal-300 text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none z-10 uppercase font-bold tracking-tight">
          PixiJS v8
        </div>
      </div>
    </div>
  );
}
