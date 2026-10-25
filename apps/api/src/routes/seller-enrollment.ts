import type { PrismaClient } from "@prisma/client";
import { Hono, type Context } from "hono";

type Dependencies = {
  db: Pick<PrismaClient, "user">;
  sessionUser: (c: Context) => Promise<{ id: string } | null>;
};

export function createSellerEnrollment({ db, sessionUser }: Dependencies) {
  const router = new Hono();
  router.post("/", async c => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "Not signed in" }, 401);
    const seller = await db.user.update({ where: { id: user.id }, data: { isSeller: true }, select: { id: true, isSeller: true } });
    return c.json({ user: seller });
  });
  return router;
}
