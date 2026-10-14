import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import config from './config/env.js';
import connectDB, { disconnectDB, getDBStatus } from './config/db.js';
import { initModels } from './models/index.js';
import logger from './utils/logger.js';
import requestIdMiddleware from './middleware/requestId.js';
import http from 'http';
import errorHandler from './middleware/error.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import doctorRoutes from './routes/doctors.js';
import configRoutes from './routes/config.js';
import casesRoutes from './routes/cases.js';
import appointmentsRoutes from './routes/appointments.js';
import consentsRoutes from './routes/consents.js';
import paymentsRoutes from './routes/payments.js';
import rtcRoutes from './routes/rtc.js';
import { initSocket, resetDoctorPresence } from './services/socket.js';
import { verifyMailer, getMailStatus } from './services/mailer.js';
import { startAllJobs, stopAllJobs } from './jobs/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Security and middleware setup
app.use(helmet());
app.use(
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
  })
);
// Use raw body for Razorpay webhook signature verification
app.use('/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: `${config.MAX_UPLOAD_MB || 10}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${config.MAX_UPLOAD_MB || 10}mb` }));
app.use(cookieParser());
app.use(requestIdMiddleware);

// Morgan streaming into Pino structured logger
app.use(
  morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    {
      stream: {
        write: (message) => logger.info({ http: message.trim() }, 'HTTP Request'),
      },
      skip: (req) => req.url === '/health',
    }
  )
);

// Rate limiting on /auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many requests on authentication routes. Please try again later.',
  },
});
app.use('/auth', authLimiter);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/doctors', doctorRoutes);
app.use('/config', configRoutes);
app.use('/cases', casesRoutes);
app.use('/appointments', appointmentsRoutes);
app.use('/consents', consentsRoutes);
app.use('/payments', paymentsRoutes);
app.use('/rtc', rtcRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  const dbStatus = getDBStatus();
  res.status(200).json({
    status: 'ok',
    db: dbStatus,
    mail: getMailStatus(),
    uptime: Math.floor(process.uptime()),
  });
});

// Central error handler
app.use(errorHandler);

let serverInstance = null;
let httpServer = null;

export async function startServer(port = config.PORT || 5000) {
  try {
    await connectDB();
    await initModels();
    logger.info('Database indexes and models initialized');

    httpServer = http.createServer(app);
    initSocket(httpServer);
    await resetDoctorPresence();
    await verifyMailer();
    startAllJobs();

    serverInstance = httpServer.listen(port, () => {
      logger.info({ port, env: config.NODE_ENV }, `SkinSentry API server listening on port ${port}`);
    });

    const gracefulShutdown = async (signal) => {
      logger.info({ signal }, 'Graceful shutdown initiated');
      stopAllJobs();
      if (serverInstance) {
        serverInstance.close(async () => {
          await disconnectDB();
          logger.info('Server and database shut down cleanly');
          process.exit(0);
        });
      } else {
        await disconnectDB();
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return serverInstance;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start server');
    process.exit(1);
  }
}

// Start automatically if run directly
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun && process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
