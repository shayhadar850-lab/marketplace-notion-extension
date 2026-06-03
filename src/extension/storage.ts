import type { MarketplaceProduct, MarketplaceStatus } from "../domain/marketplaceProduct";

export type ExtensionSettings = {
  notionToken: string;
  databaseId: string;
  defaultCurrency: string;
  defaultLocation: string;
  defaultCategory: string;
};

export type StoredState = {
  settings: ExtensionSettings;
  products: MarketplaceProduct[];
  activeStatus: MarketplaceStatus | "All";
};

const defaultSettings: ExtensionSettings = {
  notionToken: "",
  databaseId: "d9b3d3c2-1c1a-4be6-b560-1f5a1aeab0da",
  defaultCurrency: "ILS",
  defaultLocation: "",
  defaultCategory: "Home goods"
};

const defaultState: StoredState = {
  settings: defaultSettings,
  products: [],
  activeStatus: "Ready"
};

export const loadState = async (): Promise<StoredState> => {
  const stored = await chrome.storage.local.get(["settings", "products", "activeStatus"]);

  return {
    settings: { ...defaultSettings, ...(stored.settings ?? {}) },
    products: stored.products ?? [],
    activeStatus: stored.activeStatus ?? "Ready"
  };
};

export const saveSettings = async (settings: ExtensionSettings): Promise<void> => {
  await chrome.storage.local.set({ settings });
};

export const saveProducts = async (products: MarketplaceProduct[]): Promise<void> => {
  await chrome.storage.local.set({ products });
};

export const saveActiveStatus = async (activeStatus: StoredState["activeStatus"]): Promise<void> => {
  await chrome.storage.local.set({ activeStatus });
};

export const resetState = async (): Promise<void> => {
  await chrome.storage.local.set(defaultState);
};
