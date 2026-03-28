import tgpu, { common } from 'typegpu';
import * as d from 'typegpu/data';
import { std } from 'typegpu';
import { sceneLayout, MAX_PRIMS } from './sceneTypes';
import { sdSphere, sdBox, sdCylinder, smoothUnionWT } from './sdfFunctions';

// Bound scene accessor — captured by closure in all shader functions
const scene = sceneLayout.bound.scene;

// Evaluate the SDF scene at point p.
// Returns vec4f: xyz = blended primitive color, w = signed distance
const evalScene = tgpu.fn([d.vec3f], d.vec4f)((p) => {
  'use gpu';
  const s = scene.$;
  const k = s.globalSmoothK;

  let minDist = 1e5;
  let finalColor = d.vec3f(0.08, 0.08, 0.1);

  for (let i = 0; i < MAX_PRIMS; i++) {
    if (i >= s.primCount) break;

    const prim = s.primitives[i];
    const primType = prim.posType.w;

    // Skip inactive primitives (type == -1)
    if (primType < -0.5) continue;

    // Transform point to object space
    const lp = std.sub(p, d.vec3f(prim.posType.x, prim.posType.y, prim.posType.z));
    const sc = d.vec3f(prim.scale.x, prim.scale.y, prim.scale.z);
    const primColor = d.vec3f(prim.color.x, prim.color.y, prim.color.z);

    let dist = 1e5;

    if (primType < 0.5) {
      // Sphere: use average scale as radius
      const r = (sc.x + sc.y + sc.z) / 3.0;
      dist = sdSphere(lp, r);
    } else if (primType < 1.5) {
      // Box: scale as half-extents
      dist = sdBox(lp, d.vec3f(sc.x * 0.5, sc.y * 0.5, sc.z * 0.5));
    } else {
      // Cylinder: scale.x = radius, scale.y = half-height
      dist = sdCylinder(lp, sc.x * 0.5, sc.y * 0.5);
    }

    // Smooth union with color blending
    if (k > 0.001) {
      const wt = smoothUnionWT(minDist, dist, k);
      finalColor = std.mix(finalColor, primColor, wt.y);
      minDist = wt.x;
    } else {
      if (dist < minDist) {
        finalColor = d.vec3f(primColor);
        minDist = dist;
      }
    }
  }

  return d.vec4f(finalColor.x, finalColor.y, finalColor.z, minDist);
});

// Returns only the distance — used for normal calculation (calls evalScene 6 times)
const sceneDist = tgpu.fn([d.vec3f], d.f32)((p) => {
  'use gpu';
  return evalScene(p).w;
});

// Compute surface normal via central differences
const calcNormal = tgpu.fn([d.vec3f], d.vec3f)((p) => {
  'use gpu';
  const eps = 0.001;
  const nx = sceneDist(d.vec3f(p.x + eps, p.y, p.z)) - sceneDist(d.vec3f(p.x - eps, p.y, p.z));
  const ny = sceneDist(d.vec3f(p.x, p.y + eps, p.z)) - sceneDist(d.vec3f(p.x, p.y - eps, p.z));
  const nz = sceneDist(d.vec3f(p.x, p.y, p.z + eps)) - sceneDist(d.vec3f(p.x, p.y, p.z - eps));
  return std.normalize(d.vec3f(nx, ny, nz));
});

// Fragment shader: raymarches the scene and returns a shaded pixel color
const fragShader = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';

  const s = scene.$;
  const cam = s.camera;

  const aspect = cam.posAspect.w;
  const fovTan = cam.rightFov.w;

  // Reconstruct ray origin and direction from UV + camera basis
  const ndcX = (input.uv.x * 2.0 - 1.0) * aspect * fovTan;
  const ndcY = (1.0 - input.uv.y * 2.0) * fovTan;

  const ro = d.vec3f(cam.posAspect.x, cam.posAspect.y, cam.posAspect.z);
  const cRight = d.vec3f(cam.rightFov.x, cam.rightFov.y, cam.rightFov.z);
  const cUp = d.vec3f(cam.up.x, cam.up.y, cam.up.z);
  const cFwd = d.vec3f(cam.forward.x, cam.forward.y, cam.forward.z);

  const rd = std.normalize(
    std.add(cFwd, std.add(std.mul(cRight, ndcX), std.mul(cUp, ndcY))),
  );

  // Dark background gradient (bottom slightly lighter)
  const bgA = d.vec3f(0.04, 0.04, 0.06);
  const bgB = d.vec3f(0.06, 0.06, 0.09);
  let finalColor = std.mix(bgA, bgB, input.uv.y);

  // Raymarching loop
  let t = 0.01;
  for (let i = 0; i < 120; i++) {
    const p = std.add(ro, std.mul(rd, t));
    const res = evalScene(p);
    const dist = res.w;

    if (dist < 0.0008 * t) {
      // Hit — compute shading
      const hitPos = std.add(ro, std.mul(rd, t));
      const hitResult = evalScene(hitPos);
      const hitColor = d.vec3f(hitResult.x, hitResult.y, hitResult.z);
      const n = calcNormal(hitPos);

      // Key light from upper-front-right
      const light1Dir = std.normalize(d.vec3f(0.6, 1.0, 0.4));
      const diff1 = std.max(std.dot(n, light1Dir), 0.0);

      // Soft fill light from opposite side
      const light2Dir = std.normalize(d.vec3f(-0.4, 0.3, -0.5));
      const diff2 = std.max(std.dot(n, light2Dir), 0.0) * 0.3;

      // Specular highlight
      const refl = std.reflect(std.mul(rd, -1.0), n);
      const spec = std.pow(std.max(std.dot(refl, light1Dir), 0.0), 32.0) * 0.4;

      const ambient = 0.12;
      const light = ambient + diff1 * 0.8 + diff2 + spec;

      let shaded = std.mul(hitColor, light);
      // Gamma correction
      shaded = d.vec3f(std.sqrt(shaded.x), std.sqrt(shaded.y), std.sqrt(shaded.z));
      finalColor = shaded;
      break;
    }

    if (t > 80.0) break;
    t = t + dist;
  }

  return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1.0);
});

export const vertShader = common.fullScreenTriangle;
export { fragShader };
