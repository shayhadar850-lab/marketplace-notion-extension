import type { MarketplaceProduct } from "./marketplaceProduct";

export const clampSessionLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 5;
  }

  return Math.max(1, Math.min(100, Math.round(value)));
};

export const limitAutoPublishProducts = (
  products: MarketplaceProduct[],
  maxAutoPublishPerSession: number,
  selectedProductIds: string[] = []
): MarketplaceProduct[] => {
  const selectedIds = new Set(selectedProductIds);
  return products
    .filter((product) => product.status === "Ready" && selectedIds.has(product.id))
    .slice(0, clampSessionLimit(maxAutoPublishPerSession));
};
