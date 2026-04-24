import { z } from 'zod';

import { rotateUserPassword } from '../modules/users/password-rotation.service.js';

const envSchema = z.object({
  ROTATE_PASSWORD_EMAIL: z.string().email(),
  ROTATE_PASSWORD_NEW_PASSWORD: z.string().min(8).max(128),
});

async function main() {
  const { ROTATE_PASSWORD_EMAIL, ROTATE_PASSWORD_NEW_PASSWORD } = envSchema.parse(process.env);

  const user = await rotateUserPassword({
    email: ROTATE_PASSWORD_EMAIL,
    newPassword: ROTATE_PASSWORD_NEW_PASSWORD,
    // CLI-скрипт — ротация постоянного пароля (E2E setup / автоматизация).
    // Admin /reset-password endpoint передаёт default false (temp + force-change).
    clearMustChangePassword: true,
  });

  console.log(`Password rotated for ${user.email}`);
}

main()
  .then(() => {
    // Explicit exit: Prisma pool + Redis (deleteUserSession) клиенты
    // держат TCP-соединения живыми → иначе процесс висит до SIGPIPE
    // (docker exec / ssh keeps alive ~5 мин). Форсируем termination.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
