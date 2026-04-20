export type TechnoInfoCard = {
  label: string;
  value: string;
  sub: string;
  accent: string;
};

export type Techno = {
  slug: string;
  name: string;
  description: string;
  category: "library" | "native" | "engine";
  tags: string[];
  infoCards?: TechnoInfoCard[];
};

export const technos: Techno[] = [
  {
    slug: "threejs",
    name: "Three.js",
    description:
      "The most popular 3D library for the web. Abstracts WebGL with a high-level scene graph API.",
    category: "library",
    tags: ["WebGL", "WebGPU", "Scene Graph"],
    infoCards: [
      {
        label: "Scene management",
        value: "High-level",
        sub: "Scene, Camera, Renderer API",
        accent: "text-blue-400",
      },
      {
        label: "Loader support",
        value: "First-class",
        sub: "GLTFLoader, DRACO, KTX2, etc.",
        accent: "text-cyan-400",
      },
      {
        label: "Renderer",
        value: "WebGPU / WebGL",
        sub: "Automatic fallback support",
        accent: "text-indigo-400",
      },
    ],
  },
  {
    slug: "r3f",
    name: "React Three Fiber",
    description:
      "A React renderer for Three.js. Brings the full power of Three.js into a declarative component model.",
    category: "library",
    tags: ["React", "Three.js", "Declarative"],
    infoCards: [
      {
        label: "Paradigm",
        value: "Declarative",
        sub: "Scene graph as components",
        accent: "text-pink-400",
      },
      {
        label: "Eco-system",
        value: "Drei / Cannon",
        sub: "Huge library of helpers",
        accent: "text-rose-400",
      },
      {
        label: "Performance",
        value: "Native",
        sub: "Bypasses React for render loop",
        accent: "text-orange-400",
      },
    ],
  },
  {
    slug: "babylonjs",
    name: "Babylon.js",
    description:
      "A powerful, feature-rich 3D engine built by Microsoft. First-class TypeScript support and a full editor.",
    category: "engine",
    tags: ["WebGL", "WebGPU", "Physics"],
    infoCards: [
      {
        label: "Engine focus",
        value: "Game Engine",
        sub: "Built-in physics & collisions",
        accent: "text-blue-500",
      },
      {
        label: "Rendering",
        value: "WebGPU / WebGL",
        sub: "Highly optimized default shaders",
        accent: "text-cyan-500",
      },
      {
        label: "Architecture",
        value: "Object Oriented",
        sub: "Scene, Mesh, Material hierarchy",
        accent: "text-sky-500",
      },
    ],
  },
  {
    slug: "playcanvas",
    name: "PlayCanvas",
    description:
      "A high-performance WebGL/WebGPU engine. Best known for its web-based editor and incredible performance on mobile.",
    category: "engine",
    tags: ["WebGL", "Open Source", "Mobile"],
    infoCards: [
      {
        label: "Performance",
        value: "Lightweight",
        sub: "Optimized for mobile & load times",
        accent: "text-red-500",
      },
      {
        label: "Collaboration",
        value: "Cloud-first",
        sub: "Built for team-based editor work",
        accent: "text-orange-500",
      },
      {
        label: "Tech",
        value: "Component-based",
        sub: "Entity-Component-System (ECS) like",
        accent: "text-amber-500",
      },
    ],
  },
  {
    slug: "webgl",
    name: "Raw WebGL",
    description:
      "The low-level browser API for GPU-accelerated rendering. Maximum control, maximum effort.",
    category: "native",
    tags: ["WebGL", "GLSL", "Low-level"],
    infoCards: [
      {
        label: "Code volume",
        value: "~350 LOC",
        sub: "Just to render this mesh",
        accent: "text-orange-400",
      },
      {
        label: "Abstraction",
        value: "Zero",
        sub: "Direct WebGL 2.0 API",
        accent: "text-red-400",
      },
      {
        label: "DX verdict",
        value: "Very hard",
        sub: "Manual shaders, buffers, parsers",
        accent: "text-amber-400",
      },
    ],
  },
  {
    slug: "webgpu",
    name: "WebGPU",
    description:
      "The next-generation GPU API for the web. Compute shaders, better performance, modern architecture.",
    category: "native",
    tags: ["WebGPU", "WGSL", "Compute"],
    infoCards: [
      {
        label: "Command model",
        value: "Explicit",
        sub: "Record → Submit (no implicit state)",
        accent: "text-purple-400",
      },
      {
        label: "Shading language",
        value: "WGSL",
        sub: "Typed, validated at pipeline creation",
        accent: "text-violet-400",
      },
      {
        label: "Browser support",
        value: "~87% global",
        sub: "Chrome/Edge 113+, Safari 18+",
        accent: "text-blue-400",
      },
    ],
  },
];
