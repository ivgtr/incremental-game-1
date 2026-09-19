import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { GameRuntime } from './runtime/GameRuntime';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

const runtime = GameRuntime.fromStorage();
createRoot(root).render(<StrictMode><App runtime={runtime} /></StrictMode>);
