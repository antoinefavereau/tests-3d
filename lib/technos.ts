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
  category: "library" | "framework" | "native" | "engine";
  tags: string[];
  infoCards?: TechnoInfoCard[];
};

export const technos: Techno[] = [
  {
    slug: "threejs",
    name: "Three.js",
    description: "The most popular 3D library for the web. Abstracts WebGL with a high-level scene graph API.",
    category: "library",
    tags: ["WebGL", "WebGPU", "Scene Graph"],
  },
  {
    slug: "r3f",
    name: "React Three Fiber",
    description: "A React renderer for Three.js. Brings the full power of Three.js into a declarative component model.",
    category: "library",
    tags: ["React", "Three.js", "Declarative"],
  },
  {
    slug: "babylonjs",
    name: "Babylon.js",
    description: "A powerful, feature-rich 3D engine built by Microsoft. First-class TypeScript support and a full editor.",
    category: "engine",
    tags: ["WebGL", "WebGPU", "Physics"],
  },
  {
    slug: "playcanvas",
    name: "PlayCanvas",
    description: "A game engine and editor for building interactive 3D experiences. Cloud-based collaboration.",
    category: "engine",
    tags: ["Game Engine", "Editor", "Physics"],
  },
  {
    slug: "aframe",
    name: "A-Frame",
    description: "A web framework for building VR experiences. Built on top of Three.js, uses HTML-like syntax.",
    category: "framework",
    tags: ["VR", "HTML", "Three.js"],
  },
  {
    slug: "webgl",
    name: "Raw WebGL",
    description: "The low-level browser API for GPU-accelerated rendering. Maximum control, maximum effort.",
    category: "native",
    tags: ["WebGL", "GLSL", "Low-level"],
    infoCards: [
      { label: "Code volume", value: "~350 LOC", sub: "Just to render this mesh", accent: "text-orange-400" },
      { label: "Abstraction", value: "Zero", sub: "Direct WebGL 2.0 API", accent: "text-red-400" },
      { label: "DX verdict", value: "Very hard", sub: "Manual shaders, buffers, parsers", accent: "text-amber-400" },
    ],
  },
  {
    slug: "webgpu",
    name: "WebGPU",
    description: "The next-generation GPU API for the web. Compute shaders, better performance, modern architecture.",
    category: "native",
    tags: ["WebGPU", "WGSL", "Compute"],
    infoCards: [
      { label: "Command model", value: "Explicit", sub: "Record → Submit (no implicit state)", accent: "text-purple-400" },
      { label: "Shading language", value: "WGSL", sub: "Typed, validated at pipeline creation", accent: "text-violet-400" },
      { label: "Browser support", value: "~87% global", sub: "Chrome/Edge 113+, Safari 18+", accent: "text-blue-400" },
    ],
  },
  {
    slug: "spline",
    name: "Spline",
    description: "A design tool for 3D web experiences. No-code approach with a React/JS integration runtime.",
    category: "framework",
    tags: ["No-code", "Design", "Runtime"],
  },
];
