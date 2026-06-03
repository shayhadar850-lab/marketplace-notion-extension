import type { MarketplaceProduct } from "./marketplaceProduct";

type DefaultSettings = {
  defaultCurrency: string;
  defaultLocation: string;
  defaultCategory: string;
};

type BlockingIssueInput = {
  errors: string[];
  duplicateMessages: string[];
};

export const applyMarketplaceDefaults = (
  product: MarketplaceProduct,
  settings: DefaultSettings
): MarketplaceProduct => ({
  ...product,
  currency: product.currency || settings.defaultCurrency,
  location: product.location || settings.defaultLocation,
  category: product.category || settings.defaultCategory
});

export const getBlockingIssues = ({ errors, duplicateMessages }: BlockingIssueInput): string[] => {
  return [...errors, ...duplicateMessages];
};
