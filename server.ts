import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  applyCorsHeaders,
  getAiStatusSnapshot,
  handleRobotChat,
  handleRobotTranscribe,
  handleRobotTts,
} from './api/_lib/aiCore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.use((req, res, next) => {
    applyCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // 1. Key pool & AI readiness status (never returns actual API key values)
  app.get('/api/ai/status', (_req, res) => {
    res.json(getAiStatusSnapshot());
  });

  // 2. Main Robot Medical & Clinic Assistant endpoint
  app.post('/api/ai/robot', async (req, res) => {
    const result = await handleRobotChat((req.body || {}) as Record<string, unknown>);
    res.status(result.status).json(result.payload);
  });

  // 3. Text-to-Speech for Robot Voice Replies (gemini-3.8-flash-lite-tts)
  app.post('/api/ai/tts', async (req, res) => {
    const result = await handleRobotTts((req.body || {}) as Record<string, unknown>);
    res.status(result.status).json(result.payload);
  });

  // 4. Audio Transcription for Microphone Recordings (gemini-3.5-transcribe)
  app.post('/api/ai/transcribe', async (req, res) => {
    const result = await handleRobotTranscribe((req.body || {}) as Record<string, unknown>);
    res.status(result.status).json(result.payload);
  });

  // Vite Dev Middleware vs Static Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`3iadati Robot server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
