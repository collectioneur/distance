import { useSceneStore, type PrimitiveNode } from '../../store/sceneStore';
import styles from './SceneTree.module.css';

const PRIM_ICONS: Record<string, string> = {
  sphere: '◉',
  box: '▣',
  cylinder: '⬭',
};

function NodeRow({ node }: { node: PrimitiveNode }) {
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectNode = useSceneStore((s) => s.selectNode);
  const removeNode = useSceneStore((s) => s.removeNode);

  const isSelected = selectedId === node.id;

  return (
    <div
      className={`${styles.nodeRow} ${isSelected ? styles.selected : ''}`}
      onClick={() => selectNode(node.id)}
      title={node.name}
    >
      <div
        className={styles.colorDot}
        style={{
          background: `rgb(${Math.round(node.color[0] * 255)},${Math.round(
            node.color[1] * 255,
          )},${Math.round(node.color[2] * 255)})`,
        }}
      />
      <span className={styles.icon}>{PRIM_ICONS[node.primitiveType] ?? '◆'}</span>
      <span className={styles.label}>{node.name}</span>
      <button
        className={styles.deleteBtn}
        onClick={(e) => {
          e.stopPropagation();
          removeNode(node.id);
        }}
        title="Delete"
      >
        ×
      </button>
    </div>
  );
}

export default function SceneTree() {
  const nodes = useSceneStore((s) => s.nodes);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Scene</span>
        <span className={styles.headerCount}>{nodes.length}</span>
      </div>

      <div className={styles.tree}>
        {nodes.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>⬡</span>
            <span className={styles.emptyText}>No objects yet</span>
            <span className={styles.emptyHint}>Use the toolbar to add primitives</span>
          </div>
        ) : (
          nodes.map((node) => <NodeRow key={node.id} node={node} />)
        )}
      </div>
    </div>
  );
}
