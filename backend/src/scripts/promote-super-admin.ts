import { z } from 'zod';

import { promoteUserToSuperAdmin } from '../modules/users/super-admin-bootstrap.service.js';

const envSchema = z.object({
  PROMOTE_SUPER_ADMIN_EMAIL: z.string().email(),
});

async function main() {
  const { PROMOTE_SUPER_ADMIN_EMAIL } = envSchema.parse(process.env);

  const user = await promoteUserToSuperAdmin({
    email: PROMOTE_SUPER_ADMIN_EMAIL,
  });

  console.log(`Promoted ${user.email} to ${user.role}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
