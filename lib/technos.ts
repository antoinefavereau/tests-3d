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
  {
    slug: "ogl",
    name: "OGL",
    description:
      "A minimal WebGL library. It provides high-level abstractions like Scenes and Meshes while keeping the API very close to standard WebGL. Perfect for creative coding.",
    category: "library",
    tags: ["WebGL", "Lightweight", "Creative Coding"],
    infoCards: [
      {
        label: "Size",
        value: "~20KB",
        sub: "Ultra lightweight bundle",
        accent: "text-purple-400",
      },
      {
        label: "Design",
        value: "Minimalist",
        sub: "Clean & readable source code",
        accent: "text-blue-400",
      },
      {
        label: "Speed",
        value: "High",
        sub: "Very low CPU overhead",
        accent: "text-green-400",
      },
    ],
  },
  {
    slug: "filament",
    name: "Filament",
    description:
      "Google's physically based rendering (PBR) engine. Compiled to WebAssembly for the web, it offers movie-quality lighting and materials with extreme efficiency.",
    category: "engine",
    tags: ["WASM", "PBR", "Google"],
    infoCards: [
      {
        label: "Backend",
        value: "WASM",
        sub: "C++ performance in the browser",
        accent: "text-indigo-400",
      },
      {
        label: "Rendering",
        value: "Pure PBR",
        sub: "Industry-standard materials",
        accent: "text-orange-400",
      },
      {
        label: "Mobile",
        value: "Optimized",
        sub: "Incredible mobile performance",
        accent: "text-cyan-400",
      },
    ],
  },
  {
    slug: "regl",
    name: "Regl",
    description:
      "Functional and declarative WebGL. It removes the state-machine complexity of raw WebGL by using a stateless API based on functional commands.",
    category: "library",
    tags: ["WebGL", "Functional", "Stateless"],
    infoCards: [
      {
        label: "Paradigm",
        value: "Functional",
        sub: "Stateless command execution",
        accent: "text-teal-400",
      },
      {
        label: "Predictability",
        value: "High",
        sub: "No hidden global states",
        accent: "text-pink-400",
      },
      {
        label: "Usage",
        value: "Math-heavy",
        sub: "Loved by data-viz experts",
        accent: "text-yellow-400",
      },
    ],
  },
  {
    slug: "needle",
    name: "Needle Engine",
    description:
      "A high-end web engine that bridges the gap between professional 3D tools (Unity/Blender) and the web. Focused on ultra-fast loading and modularity.",
    category: "engine",
    tags: ["WebGL", "Unity", "Enterprise"],
    infoCards: [
      {
        label: "Loading",
        value: "Streaming",
        sub: "Progressive asset decryption",
        accent: "text-rose-400",
      },
      {
        label: "Ecosystem",
        value: "Tool-agnostic",
        sub: "Works with Unity, Blender, Revit",
        accent: "text-emerald-400",
      },
      {
        label: "AR",
        value: "WebXR",
        sub: "Native AR/VR capabilities",
        accent: "text-blue-500",
      },
    ],
  },
  {
    slug: "pixijs",
    name: "PixiJS (v8)",
    description:
      "The fastest 2D/3D renderer for the web. Version 8 introduces major WebGPU performance improvements and a flexible 3D rendering pipeline.",
    category: "library",
    tags: ["WebGPU", "2D/3D", "Lightning Fast"],
    infoCards: [
      {
        label: "Performance",
        value: "Elite",
        sub: "Massive sprite & mesh batching",
        accent: "text-pink-500",
      },
      {
        label: "API",
        value: "WebGPU First",
        sub: "Modern rendering pipeline",
        accent: "text-violet-500",
      },
      {
        label: "Heritage",
        value: "Production-ready",
        sub: "Powers thousands of web games",
        accent: "text-red-500",
      },
    ],
  },
];
