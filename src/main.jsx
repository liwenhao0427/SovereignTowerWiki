import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import storyGraph from './data/storyGraph.json';
import '../styles.css';

const StoryExplorer = lazy(() => import('./components/StoryExplorer.jsx'));

function App() {
  return <main className="story-only">
    <Suspense fallback={<div className="story-loading">正在载入剧情关系数据…</div>}>
      <StoryExplorer storyGraph={storyGraph} />
    </Suspense>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
