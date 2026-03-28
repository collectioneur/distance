import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { std } from 'typegpu';

// Sphere SDF: returns signed distance to sphere centered at origin with radius r
export const sdSphere = tgpu.fn([d.vec3f, d.f32], d.f32)((p, r) => {
  'use gpu';
  return std.length(p) - r;
});

// Box SDF (exact): returns signed distance to axis-aligned box centered at origin
// b = half-extents
export const sdBox = tgpu.fn([d.vec3f, d.vec3f], d.f32)((p, b) => {
  'use gpu';
  const qx = std.abs(p.x) - b.x;
  const qy = std.abs(p.y) - b.y;
  const qz = std.abs(p.z) - b.z;
  return (
    std.length(d.vec3f(std.max(qx, 0.0), std.max(qy, 0.0), std.max(qz, 0.0))) +
    std.min(std.max(qx, std.max(qy, qz)), 0.0)
  );
});

// Cylinder SDF: capped cylinder along Y axis, radius r, half-height h
export const sdCylinder = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)((p, r, h) => {
  'use gpu';
  const dx = std.length(d.vec2f(p.x, p.z)) - r;
  const dy = std.abs(p.y) - h;
  return std.min(std.max(dx, dy), 0.0) + std.length(d.vec2f(std.max(dx, 0.0), std.max(dy, 0.0)));
});

// Union: minimum of two distances
export const opUnion = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => {
  'use gpu';
  return std.min(a, b);
});

// Smooth minimum (Inigo Quilez): smoothly blends two SDF distances
// k controls the blend radius — larger k = more organic merging
export const smin = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((a, b, k) => {
  'use gpu';
  const h = std.clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return std.mix(b, a, h) - k * h * (1.0 - h);
});

// Smooth union: returns (blended_distance, blend_weight_t_towards_b)
// t is used for color interpolation: color = mix(colorA, colorB, t)
export const smoothUnionWT = tgpu.fn([d.f32, d.f32, d.f32], d.vec2f)((a, b, k) => {
  'use gpu';
  const h = std.clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  const dist = std.mix(b, a, h) - k * h * (1.0 - h);
  return d.vec2f(dist, h); // dist, blend_weight
});
