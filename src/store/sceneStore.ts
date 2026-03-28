import { create } from 'zustand';
import { PRIM_SPHERE, PRIM_BOX, PRIM_CYLINDER } from '../gpu/sceneTypes';

export type PrimitiveType = 'sphere' | 'box' | 'cylinder';

export interface PrimitiveNode {
  id: string;
  type: 'primitive';
  primitiveType: PrimitiveType;
  name: string;
  position: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number]; // 0–1 linear RGB
}

export type SceneNode = PrimitiveNode;

let _idCounter = 1;
function nextId(): string {
  return `node_${_idCounter++}`;
}

const PRIM_TYPE_MAP: Record<PrimitiveType, number> = {
  sphere: PRIM_SPHERE,
  box: PRIM_BOX,
  cylinder: PRIM_CYLINDER,
};

interface SceneState {
  nodes: SceneNode[];
  selectedId: string | null;
  globalSmoothK: number;
  maxSteps: number;
  ambientStrength: number;
  stepScale: number;
  cameraFov: number;

  // Actions
  addPrimitive: (type: PrimitiveType) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  updateNode: (id: string, patch: Partial<Omit<PrimitiveNode, 'id' | 'type'>>) => void;
  setGlobalSmoothK: (k: number) => void;
  setMaxSteps: (v: number) => void;
  setAmbientStrength: (v: number) => void;
  setStepScale: (v: number) => void;
  setCameraFov: (v: number) => void;

  // Derived — returns GPU-ready primitive list
  getGPUPrimitives: () => Array<{
    type: number;
    position: [number, number, number];
    scale: [number, number, number];
    color: [number, number, number];
  }>;
}

const DEFAULT_COLORS: [number, number, number][] = [
  [0.48, 0.42, 0.93], // purple
  [0.25, 0.72, 0.68], // teal
  [0.93, 0.42, 0.48], // rose
  [0.42, 0.78, 0.38], // green
  [0.93, 0.72, 0.25], // amber
  [0.38, 0.55, 0.93], // blue
];

export const useSceneStore = create<SceneState>((set, get) => ({
  nodes: [],
  selectedId: null,
  globalSmoothK: 0.1,
  maxSteps: 120,
  ambientStrength: 0.20,
  stepScale: 0.9,
  cameraFov: 60,

  addPrimitive: (type) => {
    const nodes = get().nodes;
    const sameType = nodes.filter(
      (n) => n.type === 'primitive' && n.primitiveType === type,
    ).length;
    const colorIdx = nodes.length % DEFAULT_COLORS.length;
    const label = type.charAt(0).toUpperCase() + type.slice(1);

    // Spread new objects slightly so they don't overlap
    const offset = (nodes.length % 5) * 1.2 - 2.4;

    const node: PrimitiveNode = {
      id: nextId(),
      type: 'primitive',
      primitiveType: type,
      name: `${label} ${sameType + 1}`,
      position: [offset, 0, 0],
      scale: [1, 1, 1],
      color: DEFAULT_COLORS[colorIdx],
    };

    set((state) => ({
      nodes: [...state.nodes, node],
      selectedId: node.id,
    }));
  },

  removeNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },

  selectNode: (id) => set({ selectedId: id }),

  updateNode: (id, patch) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n,
      ),
    }));
  },

  setGlobalSmoothK: (k) => set({ globalSmoothK: k }),
  setMaxSteps: (v) => set({ maxSteps: v }),
  setAmbientStrength: (v) => set({ ambientStrength: v }),
  setStepScale: (v) => set({ stepScale: v }),
  setCameraFov: (v) => set({ cameraFov: v }),

  getGPUPrimitives: () => {
    return get().nodes.map((n) => ({
      type: PRIM_TYPE_MAP[n.primitiveType],
      position: n.position,
      scale: n.scale,
      color: n.color,
    }));
  },
}));
