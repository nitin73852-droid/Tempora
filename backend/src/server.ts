import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config, isOriginAllowed } from './config';
import roomRoutes from './routes/roomRoutes';
import { serveFile } from './controllers/uploadController';
import { initSocket } from './socket';
import { initDatabaseSchema } from './database/client';

const app = express();
const httpServer = createServer(app);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  })
);

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'active',
    app: 'Tempora V2 Production Server',
    version: 'v2.0',
    health: '/health',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/rooms', roomRoutes);
app.get('/api/files/:fileId', serveFile);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

initSocket(io);

const startServer = async () => {
  try {
    await initDatabaseSchema();

    httpServer.listen(config.PORT, () => {
      console.log(`========================================`);
      console.log(`Tempora V2 Server running in ${config.NODE_ENV} mode`);
      console.log(`Local Access: http://localhost:${config.PORT}`);
      console.log(`========================================`);
    });
  } catch (error) {
    console.error('Fatal error starting Tempora V2 server:', error);
    process.exit(1);
  }
};

startServer();
