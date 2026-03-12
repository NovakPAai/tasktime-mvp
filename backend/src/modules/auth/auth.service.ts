import crypto from 'crypto';
import { prisma } from '../../prisma/client.js';
import { hashPassword, comparePassword } from '../../shared/utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { setUserSession, deleteUserSession } from '../../shared/redis.js';
import type { RegisterDto, LoginDto } from './auth.dto.js';

function generateRefreshExpiry(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
}

export async function register(dto: RegisterDto) {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  const passwordHash = await hashPassword(dto.password);
  const user = await prisma.user.create({
    data: { email: dto.email, passwordHash, name: dto.name },
    select: { id: true, email: true, name: true, role: true },
  });

  const tokenPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  await prisma.refreshToken.create({
    data: {
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      userId: user.id,
      expiresAt: generateRefreshExpiry(),
    },
  });

  const nowIso = new Date().toISOString();
  void setUserSession(user.id, {
    email: user.email,
    role: user.role,
    createdAt: nowIso,
    lastSeenAt: nowIso,
  });

  return { user, accessToken, refreshToken };
}

export async function login(dto: LoginDto) {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user || user.isActive === false) {
    throw new AppError(401, 'Invalid credentials');
  }

  const valid = await comparePassword(dto.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'Invalid credentials');
  }

  const tokenPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  await prisma.refreshToken.create({
    data: {
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      userId: user.id,
      expiresAt: generateRefreshExpiry(),
    },
  });

  const nowIso = new Date().toISOString();
  void setUserSession(user.id, {
    email: user.email,
    role: user.role,
    createdAt: nowIso,
    lastSeenAt: nowIso,
  });

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken,
  };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Invalid refresh token');
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Refresh token expired or revoked');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.isActive === false) {
    throw new AppError(401, 'User not found or deactivated');
  }

  // Rotate refresh token
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const newPayload = { userId: user.id, email: user.email, role: user.role };
  const newAccessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  await prisma.refreshToken.create({
    data: {
      token: crypto.createHash('sha256').update(newRefreshToken).digest('hex'),
      userId: user.id,
      expiresAt: generateRefreshExpiry(),
    },
  });

  const nowIso = new Date().toISOString();
  void setUserSession(user.id, {
    email: user.email,
    role: user.role,
    createdAt: stored.createdAt.toISOString?.() ?? nowIso,
    lastSeenAt: nowIso,
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const stored = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });

  await prisma.refreshToken.deleteMany({ where: { token: tokenHash } });

  if (stored?.userId) {
    void deleteUserSession(stored.userId);
  }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  if (!user) throw new AppError(404, 'User not found');
  return user;
}
