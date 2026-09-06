/**
 * @file auth.routes.js
 * @description Express router for authentication and session lifecycle endpoints.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authRateLimiter } from '../../middleware/authRateLimiter.js';
import {
  handleLogin,
  handleRegister,
  handleRefresh,
  handleLogout,
  handleGetMe
} from './auth.controller.js';

export const authRouter = Router();

// Public authentication routes (with bounded abuse rate limiter)
authRouter.post('/login', authRateLimiter, handleLogin);
authRouter.post('/register', authRateLimiter, handleRegister);
authRouter.post('/refresh', handleRefresh);
authRouter.post('/logout', handleLogout);

// Protected authentication routes
authRouter.get('/me', authenticate, handleGetMe);
