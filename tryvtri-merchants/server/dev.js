import express from 'express';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from '../lib/env.js';

const PORT = Number(env('API_PORT', 8787));
const API_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../api');

const routes = [
  ['post', '/api/signup', 'signup.js'],
  ['post', '/api/login', 'login.js'],
  ['get', '/api/me', 'me.js'],
  ['get', '/api/stats', 'stats.js'],
  ['get', '/api/records', 'records.js'],
  ['post', '/api/lookup', 'lookup.js'],
  ['post', '/api/qr', 'qr.js'],
  ['get', '/api/products', 'products/index.js'],
  ['post', '/api/products', 'products/index.js'],
  ['get', '/api/products/:id', 'products/[id].js'],
  ['patch', '/api/products/:id', 'products/[id].js'],
  ['delete', '/api/products/:id', 'products/[id].js'],
];

const app = express();
app.use(express.json({ limit: '1mb' }));

for (const [method, route, file] of routes) {
  const mod = await import(pathToFileURL(path.join(API_DIR, file)).href);
  app[method](route, (req, res) => {
    req.query = { ...req.query, ...req.params };
    mod.default(req, res);
  });
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`API dev server → http://localhost:${PORT}`);
});
