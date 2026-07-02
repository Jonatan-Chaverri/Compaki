import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** /dashboard → the session user's marketplace dashboard (or onboarding). */
export default async function DashboardIndex() {
  const user = await getSessionUser();
  if (user) {
    const marketplace = await prisma.marketplace.findFirst({
      where: { operatorId: user.id },
      orderBy: { createdAt: "desc" },
      select: { slug: true },
    });
    if (marketplace) redirect(`/dashboard/${marketplace.slug}`);
  }
  redirect("/onboarding");
}
