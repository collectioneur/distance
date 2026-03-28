import tgpu, { common } from "typegpu";
import * as d from "typegpu/data";
import { std } from "typegpu";
import { sceneLayout, MAX_PRIMS } from "./sceneTypes";
import { sdSphere, sdBox, sdCylinder } from "./sdfFunctions";

const scene = sceneLayout.bound.scene;

const MAX_DIST = 80.0;
// Constant surface threshold (like demo SURF_DIST) — avoids banding from 0.001 * t
const SURF_DIST = 0.001;

type Shape = d.Infer<typeof Shape>;
const Shape = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

const smoothShapeUnion = (a: Shape, b: Shape, k: number): Shape => {
  "use gpu";
  const h = std.max(k - std.abs(a.dist - b.dist), 0) / k;
  const m = h * h;

  const dist = std.min(a.dist, b.dist) - m * k * (1 / d.f32(4));

  // Blend colors based on relative distances and smoothing
  const weight = m + std.select(0, 1 - m, a.dist > b.dist);
  const color = std.mix(a.color, b.color, weight);

  return Shape({ dist, color });
};

const shapeUnion = (a: Shape, b: Shape): Shape => {
  "use gpu";
  return Shape({
    color: std.select(a.color, b.color, a.dist > b.dist),
    dist: std.min(a.dist, b.dist),
  });
};

const evalScene = tgpu.fn(
  [d.vec3f],
  d.vec4f,
)((p) => {
  "use gpu";
  const s = scene.$;
  const k = s.globalSmoothK;

  let acc = Shape({ color: d.vec3f(0.08, 0.08, 0.1), dist: 1e5 });

  for (let i = 0; i < MAX_PRIMS; i++) {
    if (i >= s.primCount) break;

    const prim = s.primitives[i];
    const primType = prim.posType.w;

    if (primType < -0.5) continue;

    const lp = std.sub(
      p,
      d.vec3f(prim.posType.x, prim.posType.y, prim.posType.z),
    );
    const sc = d.vec3f(prim.scale.x, prim.scale.y, prim.scale.z);
    const primColor = d.vec3f(prim.color.x, prim.color.y, prim.color.z);

    let dist = 1e5;

    if (primType < 0.5) {
      const r = (sc.x + sc.y + sc.z) / 3.0;
      dist = sdSphere(lp, r);
    } else if (primType < 1.5) {
      dist = sdBox(lp, d.vec3f(sc.x * 0.5, sc.y * 0.5, sc.z * 0.5));
    } else {
      dist = sdCylinder(lp, sc.x * 0.5, sc.y * 0.5);
    }

    const primShape = Shape({ color: primColor, dist });

    if (k > 0.001) {
      acc = smoothShapeUnion(acc, primShape, k);
    } else {
      acc = shapeUnion(acc, primShape);
    }
  }

  return d.vec4f(acc.color.x, acc.color.y, acc.color.z, acc.dist);
});

const sceneDist = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  "use gpu";
  return evalScene(p).w;
});

const calcNormal = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((p) => {
  "use gpu";
  const eps = 0.001;
  const ex = d.vec3f(eps, 0.0, 0.0);
  const ey = d.vec3f(0.0, eps, 0.0);
  const ez = d.vec3f(0.0, 0.0, eps);
  const nx = sceneDist(std.add(p, ex)) - sceneDist(std.sub(p, ex));
  const ny = sceneDist(std.add(p, ey)) - sceneDist(std.sub(p, ey));
  const nz = sceneDist(std.add(p, ez)) - sceneDist(std.sub(p, ez));
  const n = d.vec3f(nx, ny, nz);
  const len = std.length(n);
  return std.select(d.vec3f(0, 1, 0), std.mul(n, 1.0 / len), len > 1e-5);
});

const softShadow = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32, d.f32, d.f32],
  d.f32,
)((ro, rd, minT, maxT, k) => {
  "use gpu";
  let res = d.f32(1);
  let t = minT;

  for (let i = 0; i < 100; i++) {
    if (t >= maxT) break;
    const h = sceneDist(std.add(ro, std.mul(rd, t)));
    if (h < 0.001) return 0;
    res = std.min(res, (k * h) / t);
    t += std.max(h, 0.001);
  }

  return std.clamp(res, 0.0, 1.0);
});

const fragShader = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  "use gpu";

  const s = scene.$;
  const cam = s.camera;

  const aspect = cam.posAspect.w;
  const fovTan = cam.rightFov.w;

  const ndcX = (input.uv.x * 2.0 - 1.0) * aspect * fovTan;
  const ndcY = (1.0 - input.uv.y * 2.0) * fovTan;

  const ro = d.vec3f(cam.posAspect.x, cam.posAspect.y, cam.posAspect.z);
  const cRight = d.vec3f(cam.rightFov.x, cam.rightFov.y, cam.rightFov.z);
  const cUp = d.vec3f(cam.up.x, cam.up.y, cam.up.z);
  const cFwd = d.vec3f(cam.forward.x, cam.forward.y, cam.forward.z);

  const rd = std.normalize(
    std.add(cFwd, std.add(std.mul(cRight, ndcX), std.mul(cUp, ndcY))),
  );

  const bgA = d.vec3f(0.04, 0.04, 0.06);
  const bgB = d.vec3f(0.06, 0.06, 0.09);
  const bg = std.mix(bgA, bgB, input.uv.y);
  let finalColor = d.vec3f(bg);

  let t = 0.01;
  for (let i = 0; i < 256; i++) {
    if (i >= s.maxSteps) break;

    const p = std.add(ro, std.mul(rd, t));
    const res = evalScene(p);
    const dist = res.w;

    if (dist < SURF_DIST) {
      let tHit = t + dist;
      for (let j = 0; j < 4; j++) {
        const dSurf = sceneDist(std.add(ro, std.mul(rd, tHit)));
        if (dSurf < SURF_DIST * 0.5) break;
        tHit += dSurf;
      }

      const hitPos = std.add(ro, std.mul(rd, tHit));
      const hitRes = evalScene(hitPos);
      const hitColor = d.vec3f(hitRes.x, hitRes.y, hitRes.z);
      const n = calcNormal(hitPos);

      const lightPos = d.vec3f(3, 6, 4);
      const l = std.normalize(std.sub(lightPos, hitPos));
      const ndl = std.max(std.dot(n, l), 0.0);
      const diff = std.pow(ndl, 0.88);

      const shadowDist = std.length(std.sub(lightPos, hitPos));
      const shadow = softShadow(hitPos, l, 0.1, shadowDist, 16.0);

      const litColor = std.mul(
        hitColor,
        std.min(diff + s.ambientStrength, 1.0),
      );
      const shaded = std.mix(std.mul(litColor, 0.5), litColor, shadow);

      const fog = std.pow(std.min(tHit / MAX_DIST, 1.0), 0.7);
      finalColor = std.mix(shaded, bg, fog);
      break;
    }

    if (t > MAX_DIST) break;

    // Do not use full dist here: smooth-union can overestimate → full steps skip the surface (black frame). stepScale stays conservative.
    t = t + dist * s.stepScale;
  }

  return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1.0);
});

export const vertShader = common.fullScreenTriangle;
export { fragShader };
