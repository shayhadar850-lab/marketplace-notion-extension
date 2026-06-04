import type {
  MarketplaceAccountUpload,
  MarketplaceAccountUploadStatus,
  MarketplaceProduct,
  MarketplaceStatus
} from "./marketplaceProduct";

export type MarketplaceAccount = {
  key: string;
  label: string;
};

export const normalizeMarketplaceAccountKey = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const baseMarketplaceStatus = (product: MarketplaceProduct): MarketplaceStatus => {
  if (product.sourceStatus) {
    return product.sourceStatus;
  }

  if (product.status === "Published" || product.status === "Drafted") {
    return "Ready";
  }

  return product.status;
};

export const findAccountUpload = (
  product: MarketplaceProduct,
  accountKey: string | undefined
): MarketplaceAccountUpload | undefined => {
  if (!accountKey) {
    return undefined;
  }

  return product.accountUploads?.find((upload) => upload.accountKey === accountKey);
};

export const hasAccountUpload = (product: MarketplaceProduct, accountKey: string | undefined): boolean =>
  Boolean(findAccountUpload(product, accountKey));

export const resolveMarketplaceStatus = (
  product: MarketplaceProduct,
  accountKey: string | undefined
): MarketplaceStatus => {
  const upload = findAccountUpload(product, accountKey);
  if (upload) {
    return upload.status;
  }

  return baseMarketplaceStatus(product);
};

export const recordAccountUpload = (
  product: MarketplaceProduct,
  account: MarketplaceAccount,
  status: MarketplaceAccountUploadStatus,
  publishedUrl?: string
): MarketplaceProduct => {
  const nextUpload: MarketplaceAccountUpload = {
    accountKey: account.key,
    accountLabel: account.label,
    status,
    uploadedAt: new Date().toISOString(),
    publishedUrl
  };

  const otherUploads = (product.accountUploads ?? []).filter((upload) => upload.accountKey !== account.key);

  return {
    ...product,
    status: baseMarketplaceStatus(product),
    sourceStatus: baseMarketplaceStatus(product),
    accountUploads: [...otherUploads, nextUpload]
  };
};
