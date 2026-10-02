import { useCallback, useEffect, useState } from 'react';

import { useBackendStatus } from './lib/use-table.js';
import Body from './sections/Body.jsx';
import Food from './sections/Food.jsx';
import Freedom from './sections/Freedom.jsx';
import Overview from './sections/Overview.jsx';
import Routine from './sections/Routine.jsx';
import './App.css';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'food', label: 'Food', icon: '🥗' },
  { id: 'body', label: 'Body', icon: '💪' },
  { id: 'freedom', label: 'Freedom', icon: '🛡' },
  { id: 'routine', label: 'Routine', icon: '⏱' },
];

const IDS = SECTIONS.map((s) => s.id);
const LAST_KEY = 'dashboard-section';

/** The hash wins so #food opens straight there; otherwise pick up where you left off. */
function initialSection() {
  const fromHash = window.location.hash.replace('#', '');
  if (IDS.includes(fromHash)) return fromHash;
  try {
    const saved = localStorage.getItem(LAST_KEY);
    if (IDS.includes(saved)) return saved;
  } catch { /* private mode */ }
  return 'overview';
}

export default function App() {
  const [section, setSection] = useState(initialSection);
  const online = useBackendStatus();

  const go = useCallback((id) => {
    if (!IDS.includes(id)) return;
    setSection(id);
    window.location.hash = id;
    try { localStorage.setItem(LAST_KEY, id); } catch { /* private mode */ }
    window.scrollTo({ top: 0 });
  }, []);

  // Keep the back button and a hand-typed hash working.
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace('#', '');
      if (IDS.includes(id)) setSection(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const current = SECTIONS.find((s) => s.id === section);
    document.title = section === 'overview' ? 'Dashboard' : `${current.label} · Dashboard`;
  }, [section]);

  return (
    <div className="app">
      <header className="app-nav">
        <nav className="app-nav-inner" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`app-tab${section === s.id ? ' is-active' : ''}`}
              aria-current={section === s.id ? 'page' : undefined}
              onClick={() => go(s.id)}
            >
              <span aria-hidden="true">{s.icon}</span>
              {s.label}
            </button>
          ))}
          {!online && (
            <span className="app-offline" role="status">
              offline — saved in this browser, not to <code>data/</code>
            </span>
          )}
        </nav>
      </header>

      <main className="app-main">
        {section === 'overview' && <Overview onOpen={go} />}
        {section === 'food' && <Food />}
        {section === 'body' && <Body />}
        {section === 'freedom' && <Freedom />}
        {section === 'routine' && <Routine />}
      </main>
    </div>
  );
}
