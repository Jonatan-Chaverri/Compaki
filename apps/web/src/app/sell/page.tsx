import { redirect } from "next/navigation";
import { AppHeader } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { SellerWelcome } from "./seller-welcome";

export default async function SellPage() {
  const response = await apiFetch("/api/me");
  if (!response.ok) throw new Error("Could not load your account");
  const { user } = await response.json() as { user: { isSeller: boolean } | null };
  if (user?.isSeller) redirect("/vendor");
  return <><AppHeader /><SellerWelcome signedIn={Boolean(user)} /></>;
}
