import path from 'path';
import Case from '../models/Case.js';
import { getCaseFilePath } from './storage.js';

/**
 * Finds real historical photos for longitudinal comparison and ugly-duckling analysis.
 *
 * Rule 1: No synthetic data. If no history exists, return null/empty.
 */
export async function findCaseHistory(patientId, lesionLabel, bodySite, currentCaseId = null) {
  let priorImage = null;
  const otherLesionImages = [];

  // 1. Find most recent completed case of the same spot (same lesionLabel and bodySite)
  if (lesionLabel && bodySite) {
    const priorQuery = {
      patientId,
      lesionLabel: lesionLabel.trim(),
      bodySite: bodySite.trim(),
      status: 'completed',
    };
    if (currentCaseId) {
      priorQuery._id = { $ne: currentCaseId };
    }

    const priorCase = await Case.findOne(priorQuery).sort({ createdAt: -1 });
    if (priorCase && priorCase.imagePaths && priorCase.imagePaths.length > 0) {
      const currentEntry =
        priorCase.imagePaths.find((img) => img.kind === 'current') || priorCase.imagePaths[0];

      if (currentEntry && currentEntry.path) {
        const fileName = path.basename(currentEntry.path);
        const resolvedPath = await getCaseFilePath(patientId, priorCase._id, fileName);
        if (resolvedPath) {
          priorImage = {
            caseId: priorCase._id,
            filePath: resolvedPath,
            takenAt: currentEntry.takenAt || priorCase.createdAt,
            sha256: currentEntry.sha256,
          };
        }
      }
    }
  }

  // 2. Collect up to 3 most recent completed cases of OTHER lesion labels for ugly-duckling context
  if (lesionLabel) {
    const otherQuery = {
      patientId,
      status: 'completed',
      lesionLabel: { $exists: true, $ne: lesionLabel.trim() },
    };
    if (currentCaseId) {
      otherQuery._id = { $ne: currentCaseId };
    }

    const otherCases = await Case.find(otherQuery).sort({ createdAt: -1 }).limit(3);

    for (const otherCase of otherCases) {
      if (otherCase.imagePaths && otherCase.imagePaths.length > 0) {
        const currentEntry =
          otherCase.imagePaths.find((img) => img.kind === 'current') || otherCase.imagePaths[0];

        if (currentEntry && currentEntry.path) {
          const fileName = path.basename(currentEntry.path);
          const resolvedPath = await getCaseFilePath(patientId, otherCase._id, fileName);
          if (resolvedPath) {
            otherLesionImages.push({
              caseId: otherCase._id,
              lesionLabel: otherCase.lesionLabel,
              filePath: resolvedPath,
            });
          }
        }
      }
    }
  }

  return {
    priorImage,
    otherLesionImages,
  };
}
