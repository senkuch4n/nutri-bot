import "server-only";
import { prisma } from "@nutri-bot/db";
import { auth } from "../auth";

type PrivateContentAccess = {
  userId: string;
  tenantId: string;
  role: "OWNER" | "STAFF";
};

/** OWNER and STAFF may read, create, update and delete private recipes and templates. */
export async function resolvePrivateContentAccess(): Promise<PrivateContentAccess | null> {
  const userId = (await auth())?.privateContentUserId;
  if (!userId) return null;

  // Read current membership for each operation; two rows are sufficient to detect ambiguity.
  const user = await prisma.user.findFirst({
    where: { id: userId, googleSubject: { not: null } },
    select: { memberships: { take: 2, select: { tenantId: true, role: true } } },
  });
  if (user?.memberships.length !== 1) return null;

  const [membership] = user.memberships;
  if (!membership || (membership.role !== "OWNER" && membership.role !== "STAFF")) return null;
  return { userId, tenantId: membership.tenantId, role: membership.role };
}
