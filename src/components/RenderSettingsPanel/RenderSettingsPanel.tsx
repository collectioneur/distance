import { useSceneStore } from '../../store/sceneStore';
import styles from './RenderSettingsPanel.module.css';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, precision = 2, onChange }: SliderProps) {
  return (
    <div className={styles.fieldGroup}>
      <div className={styles.sliderHeader}>
        <span className={styles.fieldGroupLabel}>{label}</span>
        <span className={styles.sliderValue}>{value.toFixed(precision)}</span>
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

export default function RenderSettingsPanel() {
  const maxSteps = useSceneStore((s) => s.maxSteps);
  const setMaxSteps = useSceneStore((s) => s.setMaxSteps);
  const ambientStrength = useSceneStore((s) => s.ambientStrength);
  const setAmbientStrength = useSceneStore((s) => s.setAmbientStrength);
  const cameraFov = useSceneStore((s) => s.cameraFov);
  const setCameraFov = useSceneStore((s) => s.setCameraFov);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Render</span>
      </div>
      <div className={styles.content}>
        <div className={styles.section}>
          <Slider
            label="Max Steps"
            value={maxSteps}
            min={32}
            max={256}
            step={4}
            precision={0}
            onChange={setMaxSteps}
          />
          <Slider
            label="Ambient"
            value={ambientStrength}
            min={0}
            max={0.5}
            step={0.01}
            precision={2}
            onChange={setAmbientStrength}
          />
          <Slider
            label="FOV"
            value={cameraFov}
            min={20}
            max={100}
            step={1}
            precision={0}
            onChange={setCameraFov}
          />
        </div>
      </div>
    </div>
  );
}
