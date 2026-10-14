import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let cachedMetrics = null;
let lastLoadedTime = 0;
const CACHE_TTL_MS = process.env.NODE_ENV === 'production' ? 60000 : 10000;

const SUMMARY_PATH = path.resolve(__dirname, '../../../models/metrics/summary.json');

/**
 * GET /metrics/models (public, cached)
 * Returns aggregated model performance metrics, dataset provenance, and disease classes.
 */
router.get('/models', async (_req, res) => {
  const now = Date.now();
  if (cachedMetrics && now - lastLoadedTime < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json(cachedMetrics);
  }

  try {
    if (!fs.existsSync(SUMMARY_PATH)) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Model metrics summary not found on disk. Run python evaluate.py first.',
      });
    }

    const content = await fs.promises.readFile(SUMMARY_PATH, 'utf-8');
    const parsed = JSON.parse(content);

    cachedMetrics = parsed;
    lastLoadedTime = now;

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to read model performance metrics',
    });
  }
});

export default router;
