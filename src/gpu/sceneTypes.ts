import * as d from 'typegpu/data';
import tgpu from 'typegpu';

export const MAX_PRIMS = 16;

// Primitive types
export const PRIM_SPHERE = 0;
export const PRIM_BOX = 1;
export const PRIM_CYLINDER = 2;

// Camera data packed in vec4f to respect WGSL 16-byte alignment
export const CameraData = d.struct({
  posAspect: d.vec4f,  // xyz=position, w=aspect ratio
  rightFov: d.vec4f,   // xyz=camera right, w=tan(fov/2)
  up: d.vec4f,         // xyz=camera up, w=unused
  forward: d.vec4f,    // xyz=camera forward, w=unused
});

// Per-primitive data (3x vec4f = 48 bytes, 16-byte aligned)
export const PrimData = d.struct({
  posType: d.vec4f,  // xyz=position, w=type (0=sphere,1=box,2=cylinder,-1=inactive)
  scale: d.vec4f,    // xyz=scale, w=unused
  color: d.vec4f,    // xyz=color (0-1 linear RGB), w=unused
});

// Full scene uniform buffer
// Layout: CameraData (64 bytes) + 8×f32 (32 bytes) = 96 bytes before primitives array (16-byte aligned)
export const SceneUniforms = d.struct({
  camera: CameraData,
  primCount: d.u32,
  globalSmoothK: d.f32,
  maxSteps: d.u32,         // raymarch max iterations
  ambientStrength: d.f32,  // ambient light intensity
  stepScale: d.f32,        // raymarch step multiplier (< 1 = shorter/more accurate)
  _pad2: d.f32,
  _pad3: d.f32,
  _pad4: d.f32,
  primitives: d.arrayOf(PrimData, MAX_PRIMS),
});

// Bind group layout — scene data uniform
export const sceneLayout = tgpu.bindGroupLayout({
  scene: { uniform: SceneUniforms },
});
