import type { MarketplaceProduct } from "../domain/marketplaceProduct";

export type FillDraftMessage = {
  type: "FILL_MARKETPLACE_DRAFT";
  product: MarketplaceProduct;
};

export type DownloadImageMessage = {
  type: "DOWNLOAD_IMAGE";
  url: string;
};

export type ExtensionMessage = FillDraftMessage | DownloadImageMessage;

export type FillDraftResponse = {
  ok: boolean;
  missingFields: string[];
  filledFields: string[];
  imageCount: number;
  message: string;
};

export type DownloadImageResponse = {
  ok: boolean;
  bytes?: number[];
  mimeType?: string;
  message?: string;
};
