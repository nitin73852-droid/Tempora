import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config';
import roomRoutes from './routes/roomRoutes';
import { serveFile } from './controllers/uploadController';
import { initSocket } from './socket';
import { initDatabaseSchema } from './database/client';

const app = express();
const httpServer = createServer(app);

// 1. Universal CORS Header Middleware (Preflight & REST)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 2. Express CORS package fallback
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// Root API Status Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'active',
    app: 'Tempora V2 Production Server',
    version: 'v2.0',
    health: '/health',
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Routes
app.use('/api/rooms', roomRoutes);
app.get('/api/files/:fileId', serveFile);

// Dynamic CORS configuration for Socket.IO WebSockets
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

initSocket(io);

// Initialize DB schema then start server
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
