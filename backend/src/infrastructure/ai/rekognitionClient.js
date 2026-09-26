/**
 * @file rekognitionClient.js
 * @description AWS Rekognition client wrapper for single-frame face comparison.
 */

import { RekognitionClient, CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let cachedRekognitionClient = null;

/**
 * Returns or initializes the RekognitionClient singleton.
 * @returns {RekognitionClient}
 */
export function getRekognitionClient() {
  if (cachedRekognitionClient) {
    return cachedRekognitionClient;
  }

  const clientConfig = {
    region: config.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY || 'test'
    }
  };

  if (process.env.REKOGNITION_ENDPOINT) {
    clientConfig.endpoint = process.env.REKOGNITION_ENDPOINT;
  }

  cachedRekognitionClient = new RekognitionClient(clientConfig);
  return cachedRekognitionClient;
}

/**
 * Compares two facial images using AWS Rekognition CompareFaces.
 *
 * @param {object} params
 * @param {Buffer} params.sourceImage - Enrolled reference photo buffer
 * @param {Buffer} params.targetImage - Live captured snapshot buffer
 * @param {number} [params.similarityThreshold=80] - Confidence threshold percentage (0-100)
 * @returns {Promise<{ matched: boolean, similarity: number, faceMatches: any[] }>}
 */
export async function compareFacesWithRekognition({
  sourceImage,
  targetImage,
  similarityThreshold = 80
}) {
  const client = getRekognitionClient();
  const command = new CompareFacesCommand({
    SourceImage: { Bytes: sourceImage },
    TargetImage: { Bytes: targetImage },
    SimilarityThreshold: similarityThreshold
  });

  try {
    const response = await client.send(command);
    const matches = response.FaceMatches || [];

    if (matches.length > 0) {
      const bestMatch = matches[0];
      const similarityPercentage = bestMatch.Similarity || 0;
      return {
        matched: similarityPercentage >= similarityThreshold,
        similarity: similarityPercentage / 100, // Normalized to 0.0 - 1.0
        faceMatches: matches
      };
    }

    return {
      matched: false,
      similarity: 0,
      faceMatches: []
    };
  } catch (err) {
    logger.warn({ err: err.message, code: err.name }, 'AWS Rekognition CompareFaces call failed');
    throw err;
  }
}
