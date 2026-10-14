import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import config from '../config/env.js';

const router = Router();

/**
 * GET /rtc/config
 * Returns WebRTC ICE configuration built dynamically from environment.
 * Never hard-codes STUN/TURN in client code.
 */
router.get('/config', requireAuth, (req, res) => {
  const iceServers = [];

  // STUN servers
  if (config.STUN_URLS) {
    const stunUrls = config.STUN_URLS.split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (stunUrls.length > 0) {
      iceServers.push({
        urls: stunUrls,
      });
    }
  }

  // TURN server if configured
  if (config.TURN_URL && config.TURN_URL.trim()) {
    const turnEntry = {
      urls: config.TURN_URL.trim(),
    };
    if (config.TURN_USERNAME) {
      turnEntry.username = config.TURN_USERNAME.trim();
    }
    if (config.TURN_CREDENTIAL) {
      turnEntry.credential = config.TURN_CREDENTIAL.trim();
    }
    iceServers.push(turnEntry);
  }

  return res.status(200).json({ iceServers });
});

export default router;
