import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'panelium-super-secret-jwt-2026';
const JWT_EXPIRES_IN = '30d';

export interface TokenPayload {
  id: string;
  username: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

// Password Hashing
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Password Verification
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT Token Generation
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// JWT Token Verification
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// Middleware: Require Authenticated User
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión.' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Token inválido o expirado. Inicia sesión nuevamente.' });
  }

  req.user = payload;
  next();
}

// Middleware: Optional Auth (populates req.user if token is present)
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

// Middleware: Require Admin Role
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== Role.ADMIN) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de Administrador.' });
    }
    next();
  });
}
