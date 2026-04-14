import crypto from 'crypto';
import { prisma } from '../../prisma/client.js';
import { hashPassword, comparePassword } from '../../shared/utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { setUserSession, deleteUserSession, getCachedJson, setCachedJson } from '../../shared/redis.js';
import type { RegisterDto, LoginDto } from './auth.dto.js';
import type { SystemRoleType } from '@prisma/client';

// CVE-06: Brute force protection
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes
let bruteForceWarningLogged = false;

async function checkBruteForce(email: string): Promise<void> {
  const key = `auth:fail:${email.toLowerCase()}`;
  const attempts = await getCachedJson<number>(key);
  // When Redis is unavailable, getCachedJson returns null — brute force protection is disabled.
  // Nginx rate-limiting on /api/auth/ (5r/s) provides baseline protection at the edge.
  if (attempts === null && !bruteForceWarningLogged) {
    bruteForceWarningLogged = true;
    console.warn('Brute force protection disabled: Redis not available. Relying on nginx rate limits.');
  }
  if (attempts !== null && attempts >= MAX_LOGIN_ATTEMPTS) {
    throw new AppError(429, 'Too many login attempts. Try again in 15 minutes.');
  }
}

async function recordFailedAttempt(email: string): Promise<void> {
  const key = `auth:fail:${email.toLowerCase()}`;
  const current = (await getCachedJson<number>(key)) ?? 0;
  await setCachedJson(key, current + 1, LOCKOUT_SECONDS);
}

async function clearFailedAttempts(email: string): Promise<void> {
  const key = `auth:fail:${email.toLowerCase()}`;
  await setCachedJson(key, 0, 1); // TTL=1s effectively deletes
}

function generateRefreshExpiry(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
}

function extractRoles(systemRoles: { role: SystemRoleType }[]): SystemRoleType[] {
  return systemRoles.map((sr) => sr.role);
}

export async function register(dto: RegisterDto) {
  const email = dto.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  const passwordHash = await hashPassword(dto.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: dto.name,
      // New users automatically get USER system role
      systemRoles: { create: { role: 'USER' } },
    },
    select: {
      id: true,
      email: true,
      name: true,
      systemRoles: { select: { role: true } },
    },
  });

  const roles = extractRoles(user.systemRoles);
  const tokenPayload = { userId: user.id, email: user.email, systemRoles: roles };
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
    systemRoles: roles,
    createdAt: nowIso,
    lastSeenAt: nowIso,
  });

  return { user: { id: user.id, email: user.email, name: user.name, systemRoles: roles }, accessToken, refreshToken };
}

export async function login(dto: LoginDto) {
  const normalizedEmail = dto.email.trim().toLowerCase();

  // CVE-06: check brute force lockout before attempting login
  await checkBruteForce(normalizedEmail);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      isActive: true,
      mustChangePassword: true,
      systemRoles: { select: { role: true } },
    },
  });
  if (!user || user.isActive === false) {
    await recordFailedAttempt(normalizedEmail);
    throw new AppError(401, 'Invalid credentials');
  }

  const valid = await comparePassword(dto.password, user.passwordHash);
  if (!valid) {
    await recordFailedAttempt(normalizedEmail);
    throw new AppError(401, 'Invalid credentials');
  }

  // CVE-06: clear failed attempts on successful login
  await clearFailedAttempts(normalizedEmail);

  const roles = extractRoles(user.systemRoles);
  const tokenPayload = { userId: user.id, email: user.email, systemRoles: roles };
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
    systemRoles: roles,
    createdAt: nowIso,
    lastSeenAt: nowIso,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      systemRoles: roles,
      mustChangePassword: user.mustChangePassword,
    },
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

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      systemRoles: { select: { role: true } },
    },
  });
  if (!user || user.isActive === false) {
    throw new AppError(401, 'User not found or deactivated');
  }

  // Rotation must be idempotent: concurrent refresh attempts can observe the
  // same stored token, but only one of them is allowed to rotate it.
  const deleteResult = await prisma.refreshToken.deleteMany({
    where: {
      id: stored.id,
      token: tokenHash,
    },
  });
  if (deleteResult.count === 0) {
    throw new AppError(401, 'Refresh token expired or revoked');
  }

  const roles = extractRoles(user.systemRoles);
  const newPayload = { userId: user.id, email: user.email, systemRoles: roles };
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
    systemRoles: roles,
    createdAt: stored.createdAt.toISOString(),
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
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      createdAt: true,
      mustChangePassword: true,
      systemRoles: { select: { role: true } },
    },
  });
  if (!user) throw new AppError(404, 'User not found');
  return {
    ...user,
    systemRoles: extractRoles(user.systemRoles),
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw new AppError(400, 'Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.password_changed',
      entityType: 'user',
      entityId: userId,
      userId,
      details: {},
    },
  });
}
