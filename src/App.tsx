import Viewport from './components/Viewport/Viewport';
import Toolbar from './components/Toolbar/Toolbar';
import SceneTree from './components/SceneTree/SceneTree';
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel';
import RenderSettingsPanel from './components/RenderSettingsPanel/RenderSettingsPanel';
import styles from './App.module.css';

export default function App() {
  return (
    <>
      <Viewport />
      <Toolbar />
      <SceneTree />
      <div className={styles.rightColumn}>
        <RenderSettingsPanel />
        <PropertiesPanel />
      </div>
    </>
  );
}
