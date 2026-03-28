import { useEffect, useRef, useCallback } from 'react';
import { SDFRenderer } from '../../gpu/renderer';
import { useSceneStore } from '../../store/sceneStore';
import styles from './Viewport.module.css';

// --- Orbit Camera State ---
interface OrbitCamera {
  theta: number;   // horizontal angle (radians)
  phi: number;     // vertical angle (radians), clamped to avoid gimbal
  radius: number;  // distance from target
  target: [number, number, number];
  fovDeg: number;
}

function getCameraVectors(cam: OrbitCamera) {
  const { theta, phi, radius, target } = cam;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const pos: [number, number, number] = [
    target[0] + radius * cosP * sinT,
    target[1] + radius * sinP,
    target[2] + radius * cosP * cosT,
  ];

  const forward: [number, number, number] = [
    -cosP * sinT,
    -sinP,
    -cosP * cosT,
  ];
  const worldUp: [number, number, number] = [0, 1, 0];

  // right = normalize(forward × worldUp)... but worldUp may be parallel to forward near poles
  // Use standard gram-schmidt
  const fx = forward[0], fy = forward[1], fz = forward[2];
  // right = forward × worldUp
  let rx = fy * worldUp[2] - fz * worldUp[1];
  let ry = fz * worldUp[0] - fx * worldUp[2];
  let rz = fx * worldUp[1] - fy * worldUp[0];
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rLen < 1e-6) { rx = 1; ry = 0; rz = 0; }
  else { rx /= rLen; ry /= rLen; rz /= rLen; }

  // up = right × forward (not worldUp, to keep orthogonal)
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  return {
    pos,
    forward,
    right: [rx, ry, rz] as [number, number, number],
    up: [ux, uy, uz] as [number, number, number],
  };
}

export default function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SDFRenderer | null>(null);
  const cameraRef = useRef<OrbitCamera>({
    theta: 0.5,
    phi: 0.3,
    radius: 7,
    target: [0, 0, 0],
    fovDeg: 60,
  });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const errorRef = useRef<string | null>(null);

  const nodes = useSceneStore((s) => s.nodes);
  const globalSmoothK = useSceneStore((s) => s.globalSmoothK);
  const maxSteps = useSceneStore((s) => s.maxSteps);
  const ambientStrength = useSceneStore((s) => s.ambientStrength);
  const cameraFov = useSceneStore((s) => s.cameraFov);

  // Push camera to GPU
  const pushCamera = useCallback((aspect: number) => {
    const r = rendererRef.current;
    if (!r) return;
    const cam = cameraRef.current;
    const { pos, forward, right, up } = getCameraVectors(cam);
    const fovTan = Math.tan((cam.fovDeg * Math.PI) / 180 / 2);
    r.updateCamera(pos, right, up, forward, fovTan, aspect);
  }, []);

  // Sync FOV from store into camera ref and push
  useEffect(() => {
    cameraRef.current.fovDeg = cameraFov;
    const canvas = canvasRef.current;
    if (canvas) pushCamera(canvas.width / canvas.height);
  }, [cameraFov, pushCamera]);

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new SDFRenderer();
    rendererRef.current = renderer;

    renderer
      .init(canvas)
      .then(() => {
        const aspect = canvas.width / canvas.height;
        pushCamera(aspect);
        renderer.startLoop();
      })
      .catch((err) => {
        errorRef.current = String(err);
        console.error('Renderer init failed:', err);
      });

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.round(width * devicePixelRatio);
        canvas.height = Math.round(height * devicePixelRatio);
        pushCamera(canvas.width / canvas.height);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [pushCamera]);

  // Push scene changes to GPU
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const gpuPrims = useSceneStore.getState().getGPUPrimitives();
    r.updateScene(gpuPrims, globalSmoothK, maxSteps, ambientStrength);
  }, [nodes, globalSmoothK, maxSteps, ambientStrength]);

  // --- Mouse / touch orbit controls ---
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current = { x: e.clientX, y: e.clientY };

      const cam = cameraRef.current;
      cam.theta -= dx * 0.006;
      cam.phi = Math.max(-1.4, Math.min(1.4, cam.phi + dy * 0.006));

      const canvas = canvasRef.current;
      const aspect = canvas ? canvas.width / canvas.height : 1;
      pushCamera(aspect);
    },
    [pushCamera],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Non-passive wheel listener so preventDefault() works (blocks page zoom)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      cam.radius = Math.max(1.5, Math.min(30, cam.radius * (1 + e.deltaY * 0.001)));
      pushCamera(canvas.width / canvas.height);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [pushCamera]);

  return (
    <div className={styles.viewportWrapper}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {errorRef.current && (
        <div className={styles.errorOverlay}>
          <p>WebGPU Error</p>
          <small>{errorRef.current}</small>
          <p style={{ marginTop: 8, opacity: 0.6 }}>
            Make sure you're using Chrome 113+ or Edge 113+ with WebGPU enabled.
          </p>
        </div>
      )}
    </div>
  );
}
