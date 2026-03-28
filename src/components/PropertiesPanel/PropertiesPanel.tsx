import { useRef, useCallback } from "react";
import { useSceneStore, type PrimitiveNode } from "../../store/sceneStore";
import styles from "./PropertiesPanel.module.css";

// ---- Scrubable number input ----
interface Vec3FieldProps {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step?: number;
  precision?: number;
}

function Vec3Field({
  label,
  value,
  onChange,
  step = 0.1,
  precision = 2,
}: Vec3FieldProps) {
  const axes = ["X", "Y", "Z"] as const;

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldGroupLabel}>{label}</span>
      <div className={styles.vec3Row}>
        {axes.map((axis, i) => (
          <ScrubInput
            key={axis}
            axis={axis}
            value={value[i]}
            step={step}
            precision={precision}
            onChange={(v) => {
              const next = [...value] as [number, number, number];
              next[i] = v;
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface ScrubInputProps {
  axis: string;
  value: number;
  step: number;
  precision: number;
  onChange: (v: number) => void;
}

function ScrubInput({
  axis,
  value,
  step,
  precision,
  onChange,
}: ScrubInputProps) {
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editingRef.current) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startVal: value };

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = me.clientX - dragRef.current.startX;
        onChange(
          parseFloat((dragRef.current.startVal + dx * step).toFixed(precision)),
        );
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [value, step, precision, onChange],
  );

  const onDoubleClick = useCallback(() => {
    editingRef.current = true;
    inputRef.current?.select();
  }, []);

  const onBlur = useCallback(() => {
    editingRef.current = false;
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Escape") {
      editingRef.current = false;
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  return (
    <div className={styles.axisField}>
      <span className={styles.axisLabel}>{axis}</span>
      <input
        ref={inputRef}
        type="number"
        className={styles.axisInput}
        value={value.toFixed(precision)}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

// ---- Color picker ----
function toHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function fromHex(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

// ---- Smooth K slider ----
interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}

function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: SliderProps) {
  return (
    <div className={styles.fieldGroup}>
      <div className={styles.sliderHeader}>
        <span className={styles.fieldGroupLabel}>{label}</span>
        <span className={styles.sliderValue}>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

// ---- Selected node properties ----
function NodeProperties({ node }: { node: PrimitiveNode }) {
  const updateNode = useSceneStore((s) => s.updateNode);
  const removeNode = useSceneStore((s) => s.removeNode);

  return (
    <>
      <div className={styles.section}>
        <div className={styles.nodeHeader}>
          <input
            className={styles.nameInput}
            value={node.name}
            onChange={(e) => updateNode(node.id, { name: e.target.value })}
          />
          <button
            className={styles.deleteBtnLarge}
            onClick={() => removeNode(node.id)}
            title="Delete object"
          >
            ⌫
          </button>
        </div>
        <div className={styles.typeTag}>{node.primitiveType}</div>
      </div>

      <div className={styles.sectionDivider} />

      <div className={styles.section}>
        <Vec3Field
          label="Position"
          value={node.position}
          onChange={(v) => updateNode(node.id, { position: v })}
          step={0.05}
        />
        <Vec3Field
          label="Scale"
          value={node.scale}
          onChange={(v) => updateNode(node.id, { scale: v })}
          step={0.05}
        />
      </div>

      <div className={styles.sectionDivider} />

      <div className={styles.section}>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldGroupLabel}>Color</span>
          <div className={styles.colorRow}>
            <div
              className={styles.colorPreview}
              style={{
                background: `rgb(${Math.round(node.color[0] * 255)},${Math.round(
                  node.color[1] * 255,
                )},${Math.round(node.color[2] * 255)})`,
              }}
            />
            <input
              type="color"
              className={styles.colorInput}
              value={toHex(node.color)}
              onChange={(e) =>
                updateNode(node.id, { color: fromHex(e.target.value) })
              }
            />
            <span className={styles.colorHex}>{toHex(node.color)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Global blend settings ----
function GlobalSettings() {
  const globalSmoothK = useSceneStore((s) => s.globalSmoothK);
  const setGlobalSmoothK = useSceneStore((s) => s.setGlobalSmoothK);

  return (
    <div className={styles.section}>
      <Slider
        label="Smooth Blend"
        value={globalSmoothK}
        min={0}
        max={4.0}
        step={0.01}
        onChange={setGlobalSmoothK}
      />
      <p className={styles.hint}>
        Controls how smoothly objects merge with each other. 0 = sharp union.
      </p>
    </div>
  );
}

// ---- Main panel ----
export default function PropertiesPanel() {
  const selectedId = useSceneStore((s) => s.selectedId);
  const nodes = useSceneStore((s) => s.nodes);
  const selectedNode = nodes.find((n) => n.id === selectedId) as
    | PrimitiveNode
    | undefined;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Properties</span>
      </div>

      <div className={styles.content}>
        {selectedNode ? (
          <NodeProperties node={selectedNode} />
        ) : (
          <div className={styles.noSelection}>
            <span className={styles.noSelectionIcon}>↖</span>
            <span>Select an object to edit its properties</span>
          </div>
        )}

        <div className={styles.sectionDivider} />

        <div className={styles.sectionTitle}>Scene</div>
        <GlobalSettings />
      </div>
    </div>
  );
}
