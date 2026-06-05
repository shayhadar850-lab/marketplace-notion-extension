import { AlertTriangle, CheckCircle2, Database, FileInput, RefreshCw, Rocket, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clampSessionLimit, limitAutoPublishProducts } from "../domain/autoPublishSession";
import {
  findAccountUpload,
  hasAccountUpload,
  normalizeMarketplaceAccountKey,
  recordAccountUpload,
  resolveMarketplaceStatus,
  type MarketplaceAccount
} from "../domain/accountUploads";
import { applyMarketplaceDefaults, getBlockingIssues } from "../domain/productDefaults";
import type { MarketplaceProduct, MarketplaceStatus } from "../domain/marketplaceProduct";
import { findDuplicateProducts, validateMarketplaceProduct } from "../domain/productValidation";
import type { FillDraftMessage, FillDraftResponse, MarketplaceAccountResponse } from "../extension/messages";
import {
  loadState,
  saveActiveStatus,
  saveProducts,
  saveSelectedAutoPublishIds,
  saveSettings,
  type ExtensionSettings
} from "../extension/storage";
import { queryNotionProducts } from "../notion/notionAdapter";

type Notice = {
  tone: "ok" | "warn" | "error";
  text: string;
};

const statuses: Array<MarketplaceStatus | "All"> = ["Ready", "Needs Fix", "Drafted", "Published", "All"];
const emptyNotice: Notice = { tone: "ok", text: "Ready. Fill only stays manual; Auto publish is opt-in." };
const marketplaceCreateUrl = "https://www.facebook.com/marketplace/create/item?locale=he_IL";

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const clampDelaySeconds = (value: number) => {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.max(0, Math.min(600, Math.round(value)));
};

const clampStepDelaySeconds = (value: number) => {
  if (!Number.isFinite(value)) {
    return 2;
  }

  return Math.max(0, Math.min(10, Math.round(value)));
};

const statusClass = (status: MarketplaceStatus) => status.toLowerCase().replace(/\s+/g, "-");

const responseNoticeText = (response: FillDraftResponse): string => {
  const imageDebug = response.imageDebug?.slice(0, 10).join(" | ");
  if (!imageDebug || response.imageCount > 0) {
    return response.message;
  }

  return `${response.message}. Image debug: ${imageDebug}`;
};

const maskedToken = (token: string) => {
  if (!token) {
    return "No token saved";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

const accountLabel = (settings: ExtensionSettings): string =>
  settings.activeMarketplaceAccountLabel || "No Marketplace account detected yet";

const uploadStatusLabel = (status: "Drafted" | "Published"): string =>
  status === "Published" ? "Exists here" : "Drafted here";

const detectMarketplaceAccountInTab = async (tabId: number): Promise<MarketplaceAccount> => {
  let response: MarketplaceAccountResponse;
  try {
    response = (await chrome.tabs.sendMessage(tabId, {
      type: "GET_MARKETPLACE_ACCOUNT"
    })) as MarketplaceAccountResponse;
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content-script.js"] });
    response = (await chrome.tabs.sendMessage(tabId, {
      type: "GET_MARKETPLACE_ACCOUNT"
    })) as MarketplaceAccountResponse;
  }

  if (!response.ok || !response.accountLabel) {
    throw new Error(response.message ?? "Could not detect the active Marketplace account.");
  }

  return {
    key: response.accountKey || normalizeMarketplaceAccountKey(response.accountLabel),
    label: response.accountLabel
  };
};

const rememberMarketplaceAccount = async (settings: ExtensionSettings, account: MarketplaceAccount) => {
  const nextSettings: ExtensionSettings = {
    ...settings,
    activeMarketplaceAccountKey: account.key,
    activeMarketplaceAccountLabel: account.label
  };

  await saveSettings(nextSettings);
  return nextSettings;
};

const openMarketplaceCreate = async () => {
  await chrome.tabs.create({ url: marketplaceCreateUrl });
};

const waitForMarketplaceTab = async (tabId: number): Promise<void> => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete" && tab.url?.startsWith("https://www.facebook.com/marketplace/")) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      reject(new Error("Marketplace tab took too long to load."));
    }, 30000);

    const handleUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, updatedTab: chrome.tabs.Tab) => {
      if (updatedTabId !== tabId) {
        return;
      }

      if (changeInfo.status === "complete" && updatedTab.url?.startsWith("https://www.facebook.com/marketplace/")) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
  });
};

const sendDraftToTab = async (
  tabId: number,
  product: MarketplaceProduct,
  publish = false,
  stepDelayMs = 0
): Promise<FillDraftResponse> => {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith("https://www.facebook.com/marketplace/")) {
    throw new Error("Open a Facebook Marketplace create listing tab first.");
  }

  const message: FillDraftMessage = { type: "FILL_MARKETPLACE_DRAFT", product, publish, stepDelayMs };

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content-script.js"] });
    return chrome.tabs.sendMessage(tabId, message);
  }
};

const sendDraftToActiveTab = async (product: MarketplaceProduct, stepDelayMs = 0): Promise<FillDraftResponse> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url?.startsWith("https://www.facebook.com/marketplace/")) {
    throw new Error("Open a Facebook Marketplace create listing tab first.");
  }

  return sendDraftToTab(tab.id, product, false, stepDelayMs);
};

const productRisk = (product: MarketplaceProduct) => validateMarketplaceProduct(product);

export const App = () => {
  const [settings, setSettings] = useState<ExtensionSettings>({
    notionToken: "",
    databaseId: "",
    defaultCurrency: "ILS",
    defaultLocation: "",
    defaultCategory: "Home goods",
    activeMarketplaceAccountKey: "",
    activeMarketplaceAccountLabel: "",
    autoPublishDelaySeconds: 30,
    formStepDelaySeconds: 2,
    maxAutoPublishPerSession: 5
  });
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [activeStatus, setActiveStatus] = useState<MarketplaceStatus | "All">("Ready");
  const [selectedAutoPublishIds, setSelectedAutoPublishIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice>(emptyNotice);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAutoPublishing, setIsAutoPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(true);

  useEffect(() => {
    loadState()
      .then((state) => {
        setSettings(state.settings);
        setProducts(state.products);
        setActiveStatus(state.activeStatus);
        setSelectedAutoPublishIds(state.selectedAutoPublishIds);
        setSelectedId(state.products[0]?.id);
      })
      .catch((error: unknown) => {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Failed to load extension state." });
      });
  }, []);

  const effectiveProducts = useMemo(
    () =>
      products.map((product) => {
        const withDefaults = applyMarketplaceDefaults(product, settings);
        return {
          ...withDefaults,
          status: resolveMarketplaceStatus(withDefaults, settings.activeMarketplaceAccountKey)
        };
      }),
    [products, settings]
  );
  const duplicates = useMemo(() => findDuplicateProducts(effectiveProducts), [effectiveProducts]);
  const duplicateIds = useMemo(() => new Set(duplicates.map((finding) => finding.productId)), [duplicates]);
  const selectedAutoPublishIdSet = useMemo(() => new Set(selectedAutoPublishIds), [selectedAutoPublishIds]);
  const filteredProducts = effectiveProducts.filter(
    (product) => activeStatus === "All" || product.status === activeStatus
  );
  const selectedProduct = effectiveProducts.find((product) => product.id === selectedId) ?? filteredProducts[0];
  const selectedRisk = selectedProduct ? productRisk(selectedProduct) : undefined;
  const readyProducts = effectiveProducts.filter((product) => product.status === "Ready");
  const selectedReadyProducts = readyProducts.filter((product) => selectedAutoPublishIdSet.has(product.id));
  const sessionProducts = useMemo(
    () => limitAutoPublishProducts(effectiveProducts, settings.maxAutoPublishPerSession, selectedAutoPublishIds),
    [effectiveProducts, settings.maxAutoPublishPerSession, selectedAutoPublishIds]
  );
  const autoPublishDisabledReason = isSyncing
    ? "Sync is still running."
    : isAutoPublishing
      ? "Auto publish is already running."
      : selectedAutoPublishIds.length === 0
        ? "Select at least one Ready product in the queue for Auto publish."
        : selectedReadyProducts.length === 0
          ? "The selected products are not in Ready status."
          : sessionProducts.length === 0
            ? "No selected products are available for this session."
        : "";

  useEffect(() => {
    const readyIds = new Set(readyProducts.map((product) => product.id));
    const nextSelectedIds = selectedAutoPublishIds.filter((id) => readyIds.has(id));
    if (nextSelectedIds.length === selectedAutoPublishIds.length) {
      return;
    }

    setSelectedAutoPublishIds(nextSelectedIds);
    void saveSelectedAutoPublishIds(nextSelectedIds);
  }, [readyProducts, selectedAutoPublishIds]);

  const blockingIssuesFor = (product: MarketplaceProduct) => {
    const risk = productRisk(product);
    const duplicateMessages = duplicates
      .filter((item) => item.productId === product.id)
      .map((item) => `Possible duplicate of ${item.duplicateOf}: ${item.reasons.join(", ")}`);

    if (hasAccountUpload(product, settings.activeMarketplaceAccountKey)) {
      duplicateMessages.unshift(`Already uploaded in Marketplace account ${settings.activeMarketplaceAccountLabel || "this account"}.`);
    }

    return getBlockingIssues({ errors: risk.errors, duplicateMessages });
  };

  const updateSettings = async (next: ExtensionSettings) => {
    setSettings(next);
    await saveSettings(next);
  };

  const updateStatus = async (status: MarketplaceStatus | "All") => {
    setActiveStatus(status);
    await saveActiveStatus(status);
  };

  const updateSelectedQueue = async (nextIds: string[]) => {
    setSelectedAutoPublishIds(nextIds);
    await saveSelectedAutoPublishIds(nextIds);
  };

  const toggleAutoPublishSelection = async (productId: string) => {
    const isSelected = selectedAutoPublishIdSet.has(productId);
    const nextIds = isSelected
      ? selectedAutoPublishIds.filter((id) => id !== productId)
      : [...selectedAutoPublishIds, productId];

    await updateSelectedQueue(nextIds);
  };

  const selectVisibleProducts = async () => {
    const visibleReadyIds = filteredProducts.filter((product) => product.status === "Ready").map((product) => product.id);
    const nextIds = Array.from(new Set([...selectedAutoPublishIds, ...visibleReadyIds]));
    await updateSelectedQueue(nextIds);
  };

  const clearSelectedProducts = async () => {
    await updateSelectedQueue([]);
  };

  const syncProducts = async () => {
    if (!settings.notionToken || !settings.databaseId) {
      setNotice({ tone: "error", text: "Add a Notion token and database ID before syncing." });
      return;
    }

    setIsSyncing(true);
    setNotice({ tone: "ok", text: "Syncing Notion products..." });

    try {
      const notionProducts = await queryNotionProducts({ token: settings.notionToken, databaseId: settings.databaseId });
      setProducts(notionProducts);
      setSelectedId(notionProducts[0]?.id);
      const nextSelectedIds = selectedAutoPublishIds.filter((id) => notionProducts.some((product) => product.id === id));
      setSelectedAutoPublishIds(nextSelectedIds);
      await saveProducts(notionProducts);
      await saveSelectedAutoPublishIds(nextSelectedIds);
      setNotice({ tone: "ok", text: `Synced ${notionProducts.length} products from Notion.` });
    } catch (error: unknown) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Notion sync failed." });
    } finally {
      setIsSyncing(false);
    }
  };

  const fillDraft = async () => {
    if (!selectedProduct) {
      setNotice({ tone: "warn", text: "Choose a product first." });
      return;
    }

    const blockingIssues = blockingIssuesFor(selectedProduct);

    if (blockingIssues.length > 0) {
      setNotice({ tone: "error", text: blockingIssues[0] });
      if (blockingIssues.some((issue) => issue.includes("Default location"))) {
        setShowSettings(true);
      }
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("Open a Facebook Marketplace create listing tab first.");
      }

      const detectedAccount = await detectMarketplaceAccountInTab(tab.id);
      const nextSettings = await rememberMarketplaceAccount(settings, detectedAccount);
      setSettings(nextSettings);

      if (hasAccountUpload(selectedProduct, detectedAccount.key)) {
        setNotice({ tone: "warn", text: `${selectedProduct.title || "Untitled product"} was already uploaded in ${detectedAccount.label}.` });
        return;
      }

      const response = await sendDraftToActiveTab(
        selectedProduct,
        clampStepDelaySeconds(nextSettings.formStepDelaySeconds) * 1000
      );
      setNotice({ tone: response.ok ? "ok" : "warn", text: responseNoticeText(response) });
    } catch (error: unknown) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not fill the active tab." });
    }
  };

  const autoPublishQueue = async () => {
    if (sessionProducts.length === 0) {
      setNotice({ tone: "warn", text: "No Ready products are waiting in the queue." });
      return;
    }

    setIsAutoPublishing(true);
    let nextProducts = [...products];
    let publishedCount = 0;
    let draftedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      for (let index = 0; index < sessionProducts.length; index += 1) {
        const product = sessionProducts[index];
        const blockingIssues = blockingIssuesFor(product);

        if (blockingIssues.length > 0) {
          failedCount += 1;
          nextProducts = nextProducts.map((item) =>
            item.id === product.id ? { ...item, status: "Needs Fix", lastError: blockingIssues[0] } : item
          );
          setProducts(nextProducts);
          await saveProducts(nextProducts);
          continue;
        }

        setNotice({
          tone: "ok",
          text: `Auto publishing ${index + 1}/${sessionProducts.length}: ${product.title || "Untitled product"}`
        });

        try {
          const tab = await chrome.tabs.create({ url: marketplaceCreateUrl, active: true });
          if (!tab.id) {
            throw new Error("Could not open a Marketplace create tab.");
          }

          await waitForMarketplaceTab(tab.id);
          await sleep(1200);

          const detectedAccount = await detectMarketplaceAccountInTab(tab.id);
          const nextSettingsState = await rememberMarketplaceAccount(settings, detectedAccount);
          setSettings(nextSettingsState);

          if (hasAccountUpload(product, detectedAccount.key)) {
            skippedCount += 1;
            nextProducts = nextProducts.map((item) =>
              item.id === product.id
                ? {
                    ...item,
                    lastError: `Skipped: already uploaded in ${detectedAccount.label}.`
                  }
                : item
            );
            setProducts(nextProducts);
            await saveProducts(nextProducts);
            continue;
          }

          const response = await sendDraftToTab(
            tab.id,
            product,
            true,
            clampStepDelaySeconds(nextSettingsState.formStepDelaySeconds) * 1000
          );
          const publishedTab = await chrome.tabs.get(tab.id);

          nextProducts = nextProducts.map((item) => {
            if (item.id !== product.id) {
              return item;
            }

            if (response.published) {
              publishedCount += 1;
              return recordAccountUpload(
                {
                  ...item,
                  draftedAt: new Date().toISOString(),
                  publishedUrl: publishedTab.url,
                  marketplaceStatus: "Published",
                  lastError: undefined
                },
                detectedAccount,
                "Published",
                publishedTab.url
              );
            }

            if (response.missingFields.length === 1 && response.missingFields[0] === "publish") {
              draftedCount += 1;
              return recordAccountUpload(
                {
                  ...item,
                  draftedAt: new Date().toISOString(),
                  marketplaceStatus: "Drafted",
                  lastError: responseNoticeText(response)
                },
                detectedAccount,
                "Drafted"
              );
            }

            failedCount += 1;
            return {
              ...item,
              status: "Needs Fix",
              marketplaceStatus: "Needs Fix",
              lastError: responseNoticeText(response)
            };
          });

          setProducts(nextProducts);
          await saveProducts(nextProducts);

          if (response.published) {
            setNotice({
              tone: "ok",
              text: `${product.title || "Untitled product"}: Publish clicked. Keeping the tab open so Facebook can finish processing.`
            });
          }
        } catch (error: unknown) {
          failedCount += 1;
          const message = error instanceof Error ? error.message : "Auto publish failed.";
          nextProducts = nextProducts.map((item) =>
            item.id === product.id ? { ...item, status: "Needs Fix", marketplaceStatus: "Needs Fix", lastError: message } : item
          );
          setProducts(nextProducts);
          await saveProducts(nextProducts);
          setNotice({ tone: "warn", text: `${product.title || "Untitled product"}: ${message}` });
        }

        if (index < sessionProducts.length - 1) {
          await sleep(clampDelaySeconds(settings.autoPublishDelaySeconds) * 1000);
        }
      }

      setNotice({
        tone: failedCount > 0 ? "warn" : "ok",
        text: `Auto publish finished. Processed ${sessionProducts.length} products: published ${publishedCount}, drafted ${draftedCount}, skipped ${skippedCount}, failed ${failedCount}.`
      });
    } finally {
      setIsAutoPublishing(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Notion to Marketplace</p>
          <h1>Draft queue</h1>
        </div>
        <button className="icon-button" title="Settings" onClick={() => setShowSettings((value) => !value)}>
          <Settings size={18} />
        </button>
      </header>

      <section className={`notice ${notice.tone}`}>
        {notice.tone === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <span>{notice.text}</span>
      </section>

      {showSettings ? (
        <section className="settings-panel">
          <label>
            <span>Notion token</span>
            <input
              type="password"
              value={settings.notionToken}
              placeholder="ntn_..."
              onChange={(event) => updateSettings({ ...settings, notionToken: event.target.value })}
            />
          </label>
          <p className="token-hint">{maskedToken(settings.notionToken)}</p>
          <label>
            <span>Database ID</span>
            <input
              value={settings.databaseId}
              placeholder="Notion data source ID"
              onChange={(event) => updateSettings({ ...settings, databaseId: event.target.value.trim() })}
            />
          </label>
          <div className="settings-grid">
            <label>
              <span>Currency</span>
              <input
                value={settings.defaultCurrency}
                onChange={(event) => updateSettings({ ...settings, defaultCurrency: event.target.value.trim() })}
              />
            </label>
            <label>
              <span>Default category</span>
              <input
                value={settings.defaultCategory}
                onChange={(event) => updateSettings({ ...settings, defaultCategory: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span>Default location</span>
            <input
              value={settings.defaultLocation}
              placeholder="Tel Aviv"
              onChange={(event) => updateSettings({ ...settings, defaultLocation: event.target.value })}
            />
          </label>
          <label>
            <span>Active Marketplace account</span>
            <input value={accountLabel(settings)} readOnly />
          </label>
          <label>
            <span>Delay between uploads (seconds)</span>
            <input
              type="number"
              min={0}
              max={600}
              value={settings.autoPublishDelaySeconds}
              onChange={(event) =>
                updateSettings({
                  ...settings,
                  autoPublishDelaySeconds: clampDelaySeconds(Number(event.target.value))
                })
              }
            />
          </label>
          <label>
            <span>Delay between form actions (seconds)</span>
            <input
              type="number"
              min={0}
              max={10}
              value={settings.formStepDelaySeconds}
              onChange={(event) =>
                updateSettings({
                  ...settings,
                  formStepDelaySeconds: clampStepDelaySeconds(Number(event.target.value))
                })
              }
            />
          </label>
          <label>
            <span>Max products per session</span>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxAutoPublishPerSession}
              onChange={(event) =>
                updateSettings({
                  ...settings,
                  maxAutoPublishPerSession: clampSessionLimit(Number(event.target.value))
                })
              }
            />
          </label>
        </section>
      ) : null}

      <section className="actions">
        <button className="primary" onClick={syncProducts} disabled={isSyncing || isAutoPublishing}>
          <RefreshCw size={17} />
          {isSyncing ? "Syncing" : "Sync"}
        </button>
        <button onClick={openMarketplaceCreate} disabled={isAutoPublishing}>
          <Database size={17} />
          Create tab
        </button>
        <button onClick={fillDraft} disabled={!selectedProduct || isAutoPublishing}>
          <FileInput size={17} />
          Fill only
        </button>
        <button
          className="danger"
          onClick={autoPublishQueue}
          disabled={isSyncing || isAutoPublishing || sessionProducts.length === 0}
          title={autoPublishDisabledReason}
        >
          <Rocket size={17} />
          {isAutoPublishing ? "Publishing" : "Auto publish"}
        </button>
      </section>
      {autoPublishDisabledReason ? <p className="action-hint">{autoPublishDisabledReason}</p> : null}

      <nav className="status-tabs" aria-label="Product status">
        {statuses.map((status) => (
          <button key={status} className={status === activeStatus ? "active" : ""} onClick={() => updateStatus(status)}>
            {status}
          </button>
        ))}
      </nav>

      <section className="queue-toolbar">
        <p>
          {selectedReadyProducts.length} selected for Auto publish
          {selectedReadyProducts.length > settings.maxAutoPublishPerSession
            ? `, ${sessionProducts.length} will run this session`
            : ""}
        </p>
        <div className="queue-toolbar-actions">
          <button onClick={selectVisibleProducts} disabled={isAutoPublishing || filteredProducts.every((product) => product.status !== "Ready")}>
            Select visible
          </button>
          <button onClick={clearSelectedProducts} disabled={isAutoPublishing || selectedAutoPublishIds.length === 0}>
            Clear
          </button>
        </div>
      </section>

      <section className="queue">
        {filteredProducts.map((product) => {
          const risk = productRisk(product);
          const blocked = risk.errors.length > 0 || duplicateIds.has(product.id);
          const isSelectedForAutoPublish = selectedAutoPublishIdSet.has(product.id);
          const canSelectForAutoPublish = product.status === "Ready";
          const currentAccountUpload = findAccountUpload(product, settings.activeMarketplaceAccountKey);
          const thumbnailUrl = product.images[0]?.url;

          return (
            <div
              key={product.id}
              className={`product-row ${selectedProduct?.id === product.id ? "selected" : ""}`}
              onClick={() => setSelectedId(product.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(product.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div
                className={`publish-toggle ${isSelectedForAutoPublish ? "checked" : ""} ${canSelectForAutoPublish ? "" : "disabled"}`}
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelectedForAutoPublish}
                  disabled={!canSelectForAutoPublish || isAutoPublishing}
                  onChange={() => void toggleAutoPublishSelection(product.id)}
                  aria-label={`Select ${product.title || "Untitled product"} for Auto publish`}
                />
                <span>Auto</span>
              </div>
              <div className="product-thumb" aria-hidden="true">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span>No image</span>
                )}
              </div>
              <span className={`status-dot ${statusClass(product.status)}`} />
              <span className="product-main">
                <strong>{product.title || "Untitled product"}</strong>
                <small>
                  {product.price} {product.currency} | {product.location || "Missing location"} | {product.category || "No category"}
                </small>
                {currentAccountUpload ? (
                  <small className={`account-upload-badge ${currentAccountUpload.status === "Published" ? "published" : "drafted"}`}>
                    {uploadStatusLabel(currentAccountUpload.status)} | {currentAccountUpload.accountLabel}
                  </small>
                ) : null}
              </span>
              {blocked ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
            </div>
          );
        })}
        {filteredProducts.length === 0 ? <p className="empty-state">No products in this status.</p> : null}
      </section>

      {selectedProduct && selectedRisk ? (
        <section className="details">
          <h2>{selectedProduct.title}</h2>
          <p>{selectedProduct.description}</p>
          <div className="meta-grid">
            <span>SKU: {selectedProduct.sku ?? "None"}</span>
            <span>Images: {selectedProduct.images.length}</span>
            <span>Variant: {selectedProduct.variantGroup ?? "None"}</span>
            <span>Location: {selectedProduct.location || "Missing"}</span>
          </div>
          <IssueList
            title="Blocking"
            items={getBlockingIssues({
              errors: selectedRisk.errors,
              duplicateMessages: duplicates
                .filter((item) => item.productId === selectedProduct.id)
                .map((item) => `Possible duplicate of ${item.duplicateOf}: ${item.reasons.join(", ")}`)
            })}
          />
          <IssueList title="Warnings" items={selectedRisk.warnings} />
        </section>
      ) : null}
    </main>
  );
};

const IssueList = ({ title, items }: { title: string; items: string[] }) => (
  <div className="issue-list">
    <h3>{title}</h3>
    {items.length === 0 ? (
      <p className="clear">Clear</p>
    ) : (
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )}
  </div>
);
