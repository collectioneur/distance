import { useSceneStore, type PrimitiveType } from '../../store/sceneStore';
import styles from './Toolbar.module.css';

const PRIMITIVES: { type: PrimitiveType; label: string; icon: string }[] = [
  { type: 'sphere', label: 'Sphere', icon: '◉' },
  { type: 'box', label: 'Box', icon: '▣' },
  { type: 'cylinder', label: 'Cylinder', icon: '⬭' },
];

export default function Toolbar() {
  const addPrimitive = useSceneStore((s) => s.addPrimitive);

  return (
    <div className={styles.toolbar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>⬡</span>
        <span className={styles.brandName}>SDF Studio</span>
      </div>

      <div className={styles.divider} />

      <div className={styles.actions}>
        {PRIMITIVES.map(({ type, label, icon }) => (
          <button
            key={type}
            className={styles.addBtn}
            onClick={() => addPrimitive(type)}
            title={`Add ${label}`}
          >
            <span className={styles.btnIcon}>{icon}</span>
            <span className={styles.btnLabel}>+ {label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
