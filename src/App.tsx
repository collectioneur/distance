import Viewport from './components/Viewport/Viewport';
import Toolbar from './components/Toolbar/Toolbar';
import SceneTree from './components/SceneTree/SceneTree';
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel';

export default function App() {
  return (
    <>
      <Viewport />
      <Toolbar />
      <SceneTree />
      <PropertiesPanel />
    </>
  );
}
