import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import config from './env.js';

let isConnecting = false;
let listenersRegistered = false;

function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    logger.info({ host: mongoose.connection.host, name: mongoose.connection.name }, 'MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err: err.message }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
}

export async function connectDB(customUri = null, maxRetries = 5, initialDelayMs = 1000) {
  const uri = customUri || (config && config.MONGODB_URI) || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required to connect to database');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (isConnecting) {
    return mongoose.connection;
  }

  isConnecting = true;
  registerListeners();

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    attempt += 1;
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      isConnecting = false;
      return mongoose.connection;
    } catch (err) {
      logger.error(
        { attempt, maxRetries, delayMs: delay, error: err.message },
        'Failed to connect to MongoDB, retrying...'
      );
      if (attempt >= maxRetries) {
        isConnecting = false;
        throw new Error(`Could not connect to MongoDB after ${maxRetries} attempts: ${err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 10000);
    }
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed gracefully');
  }
}

export function getDBStatus() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

export default connectDB;
