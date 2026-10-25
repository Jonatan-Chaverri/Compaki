import { SellerStudioPage } from "../seller-studio-page";
export const dynamic = "force-dynamic";
export default async function VendorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SellerStudioPage marketplaceSlug={slug} />;
}
