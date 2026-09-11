import { PrismaClient } from "@prisma/client";

const client = new PrismaClient();

/**
 * One-off script to promote a user to PLATFORM_ADMIN.
 * Deliberately NOT an API route — no public endpoint should ever grant admin.
 *
 * Usage:
 *   pnpm --filter @repo/db set-platform-admin <email>
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm --filter @repo/db set-platform-admin <email>");
    process.exit(1);
  }

  const user = await client.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (user.platformRole === "PLATFORM_ADMIN") {
    console.log(`${email} is already PLATFORM_ADMIN`);
    return;
  }

  await client.user.update({
    where: { id: user.id },
    data: { platformRole: "PLATFORM_ADMIN" },
  });
  console.log(`Promoted ${email} (${user.id}) to PLATFORM_ADMIN`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await client.$disconnect();
  });