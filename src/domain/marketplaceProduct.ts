export type MarketplaceStatus = "Ready" | "Needs Fix" | "Drafted" | "Published";

export type MarketplaceImage = {
  url: string;
  name: string;
};

export type MarketplaceAccountUploadStatus = "Drafted" | "Published";

export type MarketplaceAccountUpload = {
  accountKey: string;
  accountLabel: string;
  status: MarketplaceAccountUploadStatus;
  uploadedAt: string;
  publishedUrl?: string;
};

export type MarketplaceProduct = {
  id: string;
  status: MarketplaceStatus;
  sourceStatus?: MarketplaceStatus;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  condition: string;
  location: string;
  images: MarketplaceImage[];
  sku?: string;
  material?: string;
  color?: string;
  dimensions?: string;
  printTime?: string;
  customization?: string;
  variantGroup?: string;
  draftedAt?: string;
  publishedUrl?: string;
  marketplaceStatus?: string;
  lastError?: string;
  accountUploads?: MarketplaceAccountUpload[];
};

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export type DuplicateFinding = {
  productId: string;
  duplicateOf: string;
  reasons: string[];
};
