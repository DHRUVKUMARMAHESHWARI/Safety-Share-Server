import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import connectDB from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import hazardRoutes from './routes/hazardRoutes.js';

// Connect to Database
connectDB();

const app = express();

// Security Middleware (CORS Setup)
const allowedOrigins = config.corsOrigin.split(',').map(o => o.trim());
app.use(helmet());
app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
app.use(compression());

// Logging
if (config.env === 'development') {
  app.use(morgan('dev'));
}

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(limiter);

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createServer } from 'http';
import { Server } from 'socket.io';
import trackingRoutes from './routes/trackingRoutes.js';

const httpServer = createServer(app);
const io = new Server(httpServer, {
 cors: {
   origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
   methods: ["GET", "POST"],
   credentials: true
 }
});

// Attach io to req
app.use((req, res, next) => {
 req.io = io;
 next();
});

io.on('connection', (socket) => {
 console.log('New client connected:', socket.id);
 
 socket.on('join_user', (userId) => {
   socket.join(`user:${userId}`);
 });

 socket.on('disconnect', () => {
   console.log('Client disconnected:', socket.id);
 });
});

import adminRoutes from './routes/adminRoutes.js';

import communityRoutes from './routes/communityRoutes.js';

// Routes
const apiRouter = express.Router();
apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/hazards', hazardRoutes);
apiRouter.use('/tracking', trackingRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/community', communityRoutes);

app.use('/api', apiRouter);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Global Error Handler
app.use(errorHandler);

const PORT = config.port;

httpServer.listen(PORT, () => {
 console.log(`Server running in ${config.env} mode on port ${PORT}`);
});

export default app;
