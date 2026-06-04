import type { MarketplaceProduct } from "../domain/marketplaceProduct";

export type FillDraftMessage = {
  type: "FILL_MARKETPLACE_DRAFT";
  product: MarketplaceProduct;
  publish?: boolean;
  stepDelayMs?: number;
};

export type DownloadImageMessage = {
  type: "DOWNLOAD_IMAGE";
  url: string;
};

export type GetMarketplaceAccountMessage = {
  type: "GET_MARKETPLACE_ACCOUNT";
};

export type ExtensionMessage = FillDraftMessage | DownloadImageMessage | GetMarketplaceAccountMessage;

export type FillDraftResponse = {
  ok: boolean;
  missingFields: string[];
  filledFields: string[];
  imageCount: number;
  published: boolean;
  message: string;
  imageDebug?: string[];
};

export type DownloadImageResponse = {
  ok: boolean;
  dataUrl?: string;
  bytes?: number[];
  mimeType?: string;
  message?: string;
};

export type MarketplaceAccountResponse = {
  ok: boolean;
  accountKey?: string;
  accountLabel?: string;
  message?: string;
};
