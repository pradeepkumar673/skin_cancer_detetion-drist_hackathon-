import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

import config from '../config/env.js';
import Case from '../models/Case.js';
import Analysis from '../models/Analysis.js';
import WoundMeasurement from '../models/WoundMeasurement.js';
import logger from '../utils/logger.js';
import { emitCaseUpdate } from './socket.js';
import { findCaseHistory } from './history.js';
import { getCaseFilePath, saveCaseArtifact } from './storage.js';

class AnalysisQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  enqueue(caseId) {
    this.queue.push(String(caseId));
    logger.info({ caseId, queueLength: this.queue.length }, 'Case enqueued for AI screening');
    this.tick();
  }

  async tick() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const caseId = this.queue.shift();
    this.running += 1;

    try {
      await this.processCase(caseId);
    } catch (err) {
      logger.error({ caseId, error: err.message }, 'Unhandled error in queue worker');
    } finally {
      this.running -= 1;
      this.tick();
    }
  }

  async processCase(caseId) {
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      logger.warn({ caseId }, 'Case not found in queue worker');
      return;
    }

    caseDoc.status = 'processing';
    await caseDoc.save();
    emitCaseUpdate(caseDoc.createdBy, caseDoc._id, 'processing');

    const startTime = Date.now();

    try {
      // 1. Locate primary current image file
      const currentEntry =
        caseDoc.imagePaths.find((img) => img.kind === 'current') || caseDoc.imagePaths[0];

      if (!currentEntry) {
        throw new Error('Case contains no valid image reference');
      }

      const currentFileName = path.basename(currentEntry.path);
      const currentFilePath = await getCaseFilePath(caseDoc.patientId, caseDoc._id, currentFileName);

      if (!currentFilePath) {
        throw new Error(`Current image file missing from disk: ${currentEntry.path}`);
      }

      // 2. Fetch history (prior photo of same lesion and other lesion photos)
      const { priorImage, otherLesionImages } = await findCaseHistory(
        caseDoc.patientId,
        caseDoc.lesionLabel,
        caseDoc.bodySite,
        caseDoc._id
      );

      // 3. Assemble multipart payload
      const form = new FormData();
      form.append('image', fs.createReadStream(currentFilePath), { filename: 'current.jpg' });

      if (priorImage && fs.existsSync(priorImage.filePath)) {
        form.append('prior_image', fs.createReadStream(priorImage.filePath), { filename: 'prior.jpg' });
      }

      if (otherLesionImages && otherLesionImages.length > 0) {
        for (const oth of otherLesionImages) {
          if (fs.existsSync(oth.filePath)) {
            form.append('other_lesion_images', fs.createReadStream(oth.filePath), {
              filename: path.basename(oth.filePath),
            });
          }
        }
      }

      const contextPayload = {
        skinType: caseDoc.context?.skinType,
        sunExposure: caseDoc.context?.sunExposure,
        familyHistorySkinCancer: caseDoc.context?.familyHistorySkinCancer,
        isDiabetic: caseDoc.context?.isDiabetic,
        pxPerCm: caseDoc.context?.pxPerCm,
      };
      form.append('patient_context', JSON.stringify(contextPayload));

      const language = caseDoc.context?.language || 'en';

      // 4. Call AI service with exponential retries on 5xx or timeout
      const aiServiceUrl = `${config.AI_SERVICE_URL.replace(/\/+$/, '')}/v1/analyze?language=${language}`;
      const maxRetries = config.AI_MAX_RETRIES || 3;
      const timeoutMs = config.AI_TIMEOUT_MS || 30000;

      let response = null;
      let delayMs = 1000;

      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
          response = await axios.post(aiServiceUrl, form, {
            headers: {
              ...form.getHeaders(),
              'X-API-Key': config.AI_SERVICE_API_KEY,
            },
            timeout: timeoutMs,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });
          break;
        } catch (callErr) {
          const status = callErr.response?.status;
          const isRetryable = !status || (status >= 500 && status < 600) || callErr.code === 'ECONNABORTED';

          if (attempt < maxRetries && isRetryable) {
            logger.warn(
              { caseId, attempt, maxRetries, delayMs, error: callErr.message },
              'AI service request failed; retrying with backoff'
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2;
          } else {
            throw callErr;
          }
        }
      }

      const aiData = response.data;
      const durationMs = Date.now() - startTime;

      // 5. Separate base64 visual artifacts and save as files on disk
      const sanitizedResult = JSON.parse(JSON.stringify(aiData));

      if (aiData.artifacts?.overlay_png_b64) {
        const overlayBuf = Buffer.from(aiData.artifacts.overlay_png_b64, 'base64');
        const overlayName = await saveCaseArtifact(caseDoc.patientId, caseDoc._id, 'overlay.png', overlayBuf);
        sanitizedResult.artifacts.overlay_png_b64 = overlayName;
      }

      if (aiData.artifacts?.heatmap_png_b64) {
        const heatmapBuf = Buffer.from(aiData.artifacts.heatmap_png_b64, 'base64');
        const heatmapName = await saveCaseArtifact(caseDoc.patientId, caseDoc._id, 'heatmap.png', heatmapBuf);
        sanitizedResult.artifacts.heatmap_png_b64 = heatmapName;
      }

      if (aiData.teams?.cancer?.junior_a?.mask_png_b64) {
        const maskBuf = Buffer.from(aiData.teams.cancer.junior_a.mask_png_b64, 'base64');
        const maskName = await saveCaseArtifact(caseDoc.patientId, caseDoc._id, 'cancer_mask.png', maskBuf);
        sanitizedResult.teams.cancer.junior_a.mask_png_b64 = maskName;
      }

      if (aiData.teams?.ulcer?.junior_a?.mask_png_b64) {
        const maskBuf = Buffer.from(aiData.teams.ulcer.junior_a.mask_png_b64, 'base64');
        const maskName = await saveCaseArtifact(caseDoc.patientId, caseDoc._id, 'ulcer_mask.png', maskBuf);
        sanitizedResult.teams.ulcer.junior_a.mask_png_b64 = maskName;
      }

      // 6. Save Analysis document
      const analysisDoc = await Analysis.create({
        caseId: caseDoc._id,
        requestId: aiData.request_id || uuidv4(),
        modelVersions: aiData.model_versions || {},
        result: sanitizedResult,
        durationMs,
      });

      // 7. Update Case status
      const decision = aiData.safety?.decision;
      if (decision === 'abstain') {
        caseDoc.status = 'abstained';
      } else {
        caseDoc.status = 'completed';
      }
      caseDoc.analysisId = analysisDoc._id;
      await caseDoc.save();

      // 8. If ulcer team provided wound measurements, record WoundMeasurement
      if (aiData.teams?.ulcer?.junior_a) {
        const uJunior = aiData.teams.ulcer.junior_a;
        await WoundMeasurement.create({
          caseId: caseDoc._id,
          patientId: caseDoc.patientId,
          lesionLabel: caseDoc.lesionLabel,
          areaPx: uJunior.area_px || 0,
          areaCm2: uJunior.area_cm2 || null,
          tissue: {
            granulation: uJunior.tissue?.granulation || 0,
            slough: uJunior.tissue?.slough || 0,
            necrotic: uJunior.tissue?.necrotic || 0,
            other: uJunior.tissue?.other || 0,
          },
          takenAt: currentEntry.takenAt || caseDoc.createdAt,
        });
      }

      emitCaseUpdate(caseDoc.createdBy, caseDoc._id, caseDoc.status);
      logger.info(
        { caseId, status: caseDoc.status, durationMs, decision },
        'AI screening analysis completed successfully'
      );
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error({ caseId, error: err.message, durationMs }, 'AI screening failed');

      caseDoc.status = 'failed';
      await caseDoc.save();

      await Analysis.create({
        caseId: caseDoc._id,
        requestId: uuidv4(),
        durationMs,
        error: err.message,
      });

      emitCaseUpdate(caseDoc.createdBy, caseDoc._id, 'failed', { error: err.message });
    }
  }
}

export const analysisQueue = new AnalysisQueue(config.ANALYSIS_CONCURRENCY || 2);
export default analysisQueue;
