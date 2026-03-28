import tgpu, { type TgpuRoot, type TgpuBuffer, type TgpuRenderPipeline, type TgpuBindGroup } from 'typegpu';
import * as d from 'typegpu/data';
import {
  sceneLayout,
  SceneUniforms,
  CameraData,
  PrimData,
  MAX_PRIMS,
} from './sceneTypes';
import { vertShader, fragShader } from './raymarchShader';

export interface PrimitiveUpdate {
  type: number;
  position: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
}

interface CameraState {
  pos: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  forward: [number, number, number];
  fovTan: number;
  aspect: number;
}

export class SDFRenderer {
  private root: TgpuRoot | null = null;
  private ctx: GPUCanvasContext | null = null;
  private pipeline: TgpuRenderPipeline | null = null;
  private sceneBuffer: TgpuBuffer<typeof SceneUniforms> | null = null;
  private bindGroup: TgpuBindGroup | null = null;
  private animFrameId: number | null = null;
  private _onFrame: (() => void) | null = null;

  // JS-side state mirror
  private _camera: CameraState = {
    pos: [0, 2, 7],
    right: [1, 0, 0],
    up: [0, 1, 0],
    forward: [0, -0.28, -0.96],
    fovTan: 0.577,
    aspect: 1,
  };
  private _primitives: PrimitiveUpdate[] = [];
  private _smoothK = 0.3;
  private _maxSteps = 120;
  private _ambientStrength = 0.20;
  private _stepScale = 0.9;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) throw new Error('WebGPU not supported in this browser');

    this.root = await tgpu.init();
    this.ctx = this.root.configureContext({ canvas });

    const buf = this.root.createBuffer(SceneUniforms).$usage('uniform');
    this.sceneBuffer = buf;

    this.bindGroup = this.root.createBindGroup(sceneLayout, { scene: buf });

    // Cast is needed because the TypeScript overload matching is strict
    this.pipeline = this.root.createRenderPipeline({
      vertex: vertShader,
      fragment: fragShader,
    }) as unknown as TgpuRenderPipeline;

    this._flush();
  }

  setOnFrame(cb: () => void): void {
    this._onFrame = cb;
  }

  updateCamera(
    pos: [number, number, number],
    right: [number, number, number],
    up: [number, number, number],
    forward: [number, number, number],
    fovTan: number,
    aspect: number,
  ): void {
    this._camera = { pos, right, up, forward, fovTan, aspect };
    this._flush();
  }

  updateScene(primitives: PrimitiveUpdate[], globalSmoothK: number, maxSteps: number, ambientStrength: number, stepScale: number): void {
    this._primitives = primitives;
    this._smoothK = globalSmoothK;
    this._maxSteps = maxSteps;
    this._ambientStrength = ambientStrength;
    this._stepScale = stepScale;
    this._flush();
  }

  private _buildFullData() {
    const cam = this._camera;
    const primArray = Array.from({ length: MAX_PRIMS }, (_, i) => {
      const p = this._primitives[i];
      if (!p) {
        return PrimData({
          posType: d.vec4f(0, 0, 0, -1),
          scale: d.vec4f(1, 1, 1, 0),
          color: d.vec4f(0, 0, 0, 0),
        });
      }
      return PrimData({
        posType: d.vec4f(p.position[0], p.position[1], p.position[2], p.type),
        scale: d.vec4f(p.scale[0], p.scale[1], p.scale[2], 0),
        color: d.vec4f(p.color[0], p.color[1], p.color[2], 0),
      });
    });

    return SceneUniforms({
      camera: CameraData({
        posAspect: d.vec4f(cam.pos[0], cam.pos[1], cam.pos[2], cam.aspect),
        rightFov: d.vec4f(cam.right[0], cam.right[1], cam.right[2], cam.fovTan),
        up: d.vec4f(cam.up[0], cam.up[1], cam.up[2], 0),
        forward: d.vec4f(cam.forward[0], cam.forward[1], cam.forward[2], 0),
      }),
      primCount: this._primitives.length,
      globalSmoothK: this._smoothK,
      maxSteps: this._maxSteps,
      ambientStrength: this._ambientStrength,
      stepScale: this._stepScale,
      _pad2: 0,
      _pad3: 0,
      _pad4: 0,
      primitives: primArray,
    });
  }

  private _flush(): void {
    if (!this.sceneBuffer) return;
    this.sceneBuffer.write(this._buildFullData());
  }

  render(): void {
    if (!this.pipeline || !this.bindGroup || !this.ctx) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.pipeline as any)
      .with(this.bindGroup)
      .withColorAttachment({ view: this.ctx })
      .draw(3);
  }

  startLoop(): void {
    const loop = () => {
      this._onFrame?.();
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stopLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  destroy(): void {
    this.stopLoop();
    this.root?.destroy();
    this.root = null;
    this.pipeline = null;
    this.sceneBuffer = null;
    this.bindGroup = null;
    this.ctx = null;
  }
}
