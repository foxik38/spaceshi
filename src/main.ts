import { App } from './app';

const root = document.getElementById('app')!;
const app = new App(root);
(window as any).__app = app;
app.start();
