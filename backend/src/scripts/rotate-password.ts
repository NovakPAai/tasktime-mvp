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
  });

  console.log(`Password rotated for ${user.email} (${user.role})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
