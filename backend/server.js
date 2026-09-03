import { Buffer } from 'buffer';
if (!Buffer.SlowBuffer) {
  Buffer.SlowBuffer = Buffer;
}

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from 'body-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import { connectDB } from "./config/db.js";

// Routes
import authenticationRouter from "./routers/auth/authentication.router.js";
import redirectRouter from "./routers/auth/redirect.router.js";
import adminRouter from "./routers/admin/admin.router.js"; // Ensure admin router is properly imported
import busStopRouter from "./routers/user/user.router.js";
import busRouter from "./routers/user/bus.router.js";
import driverRouter from "./routers/driver/driver.router.js";
import abusrouteRouter from './routers/admin/abusroute.router.js';
import busStopsViewRouter from './routers/admin/busStopsView.router.js';
import profileRouter from "./routers/user/profile.router.js"; 
import tripRouter from "./routers/user/trip.router.js"; 

dotenv.config();
const app = express();

// Connect to PostgreSQL
connectDB();

app.use(bodyParser.json({ limit: '5mb' }));

// Automatically normalize double-slashes in request URLs (e.g. //driver/my-bus -> /driver/my-bus)
app.use((req, res, next) => {
  if (req.url && req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

app.get("/", (req, res) => res.send({ message: "KGP Bus Service API" }));

// Dynamic CORS configuration supporting local network testing & multi-platform deployment
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL_LOCAL || 'http://localhost:3000,https://kgp-bus-frontend.vercel.app')
  .split(',')
  .map(url => url.trim());

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Allow mobile apps, curl, Postman
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return true;
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  if (/^http:\/\/(10|192\.168|172\.(1[6-9]|2[0-9]|3[0-1]))\.\d+\.\d+(:\d+)?$/.test(origin)) return true;
  if (origin.startsWith('http://10.') || origin.startsWith('http://192.168.') || origin.startsWith('http://172.')) return true;
  if (origin.endsWith('.vercel.app') || origin.endsWith('.render.com') || origin.endsWith('.netlify.app')) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With", "Accept", "Accept-Version", "Content-Length", "Content-MD5", "Date", "X-Api-Version"],
    exposedHeaders: ["Content-Range", "X-Content-Range"]
  })
);

// Ensure cookies are handled correctly
app.use(cookieParser());

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'kgpservice',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: true, // Ensure secure cookies
    sameSite: 'none' // Allow cross-site cookies
  }
}));

// Register routes
app.use('/', authenticationRouter);
app.use('/', redirectRouter);
app.use('/admin', adminRouter); // Ensure admin router is properly mounted
app.use('/bus_stops', busStopRouter);
app.use('/buses', busRouter);
app.use('/driver', driverRouter);
app.use('/abusroute', abusrouteRouter);
app.use('/busStopsView', busStopsViewRouter);
app.use('/trips', tripRouter);

app.use('/profile', profileRouter); 

// Add a test route to confirm server is running
app.get('/api-status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    routes: {
      adminUsers: '/admin/users' // Helps confirm expected URL pattern
    }
  });
});

import http from 'http';
import { initSocket } from './socket.js';

// Start server with HTTP + Socket.io
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.io Server
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server & Socket.io running on port ${PORT}`);
});

export default app;