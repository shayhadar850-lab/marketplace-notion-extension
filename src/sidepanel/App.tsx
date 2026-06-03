import { AlertTriangle, CheckCircle2, Database, FileInput, RefreshCw, Rocket, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { applyMarketplaceDefaults, getBlockingIssues } from "../domain/productDefaults";
import type { MarketplaceProduct, MarketplaceStatus } from "../domain/marketplaceProduct";
import { findDuplicateProducts, validateMarketplaceProduct } from "../domain/productValidation";
import type { FillDraftMessage, FillDraftResponse } from "../extension/messages";
import { loadState, saveActiveStatus, saveProducts, saveSettings, type ExtensionSettings } from "../extension/storage";
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

const statusClass = (status: MarketplaceStatus) => status.toLowerCase().replace(/\s+/g, "-");

const maskedToken = (token: string) => {
  if (!token) {
    return "No token saved";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
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
  publish = false
): Promise<FillDraftResponse> => {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith("https://www.facebook.com/marketplace/")) {
    throw new Error("Open a Facebook Marketplace create listing tab first.");
  }

  const message: FillDraftMessage = { type: "FILL_MARKETPLACE_DRAFT", product, publish };

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content-script.js"] });
    return chrome.tabs.sendMessage(tabId, message);
  }
};

const sendDraftToActiveTab = async (product: MarketplaceProduct): Promise<FillDraftResponse> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url?.startsWith("https://www.facebook.com/marketplace/")) {
    throw new Error("Open a Facebook Marketplace create listing tab first.");
  }

  return sendDraftToTab(tab.id, product, false);
};

const productRisk = (product: MarketplaceProduct) => validateMarketplaceProduct(product);

export const App = () => {
  const [settings, setSettings] = useState<ExtensionSettings>({
    notionToken: "",
    databaseId: "",
    defaultCurrency: "ILS",
    defaultLocation: "",
    defaultCategory: "Home goods",
    autoPublishDelaySeconds: 30
  });
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [activeStatus, setActiveStatus] = useState<MarketplaceStatus | "All">("Ready");
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
        setSelectedId(state.products[0]?.id);
      })
      .catch((error: unknown) => {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Failed to load extension state." });
      });
  }, []);

  const effectiveProducts = useMemo(
    () => products.map((product) => applyMarketplaceDefaults(product, settings)),
    [products, settings]
  );
  const duplicates = useMemo(() => findDuplicateProducts(effectiveProducts), [effectiveProducts]);
  const duplicateIds = useMemo(() => new Set(duplicates.map((finding) => finding.productId)), [duplicates]);
  const filteredProducts = effectiveProducts.filter(
    (product) => activeStatus === "All" || product.status === activeStatus
  );
  const selectedProduct = effectiveProducts.find((product) => product.id === selectedId) ?? filteredProducts[0];
  const selectedRisk = selectedProduct ? productRisk(selectedProduct) : undefined;
  const readyProducts = effectiveProducts.filter((product) => product.status === "Ready");

  const blockingIssuesFor = (product: MarketplaceProduct) => {
    const risk = productRisk(product);
    const duplicateMessages = duplicates
      .filter((item) => item.productId === product.id)
      .map((item) => `Possible duplicate of ${item.duplicateOf}: ${item.reasons.join(", ")}`);

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
      await saveProducts(notionProducts);
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
      const response = await sendDraftToActiveTab(selectedProduct);
      setNotice({ tone: response.ok ? "ok" : "warn", text: response.message });
    } catch (error: unknown) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not fill the active tab." });
    }
  };

  const autoPublishQueue = async () => {
    if (readyProducts.length === 0) {
      setNotice({ tone: "warn", text: "No Ready products are waiting in the queue." });
      return;
    }

    setIsAutoPublishing(true);
    let nextProducts = [...effectiveProducts];
    let publishedCount = 0;
    let draftedCount = 0;
    let failedCount = 0;

    try {
      for (let index = 0; index < readyProducts.length; index += 1) {
        const product = readyProducts[index];
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
          text: `Auto publishing ${index + 1}/${readyProducts.length}: ${product.title || "Untitled product"}`
        });

        try {
          const tab = await chrome.tabs.create({ url: marketplaceCreateUrl, active: true });
          if (!tab.id) {
            throw new Error("Could not open a Marketplace create tab.");
          }

          await waitForMarketplaceTab(tab.id);
          await sleep(1200);

          const response = await sendDraftToTab(tab.id, product, true);
          const publishedTab = await chrome.tabs.get(tab.id);

          nextProducts = nextProducts.map((item) => {
            if (item.id !== product.id) {
              return item;
            }

            if (response.published) {
              publishedCount += 1;
              return {
                ...item,
                status: "Published",
                draftedAt: new Date().toISOString(),
                publishedUrl: publishedTab.url,
                marketplaceStatus: "Published",
                lastError: undefined
              };
            }

            if (response.missingFields.length === 1 && response.missingFields[0] === "publish") {
              draftedCount += 1;
              return {
                ...item,
                status: "Drafted",
                draftedAt: new Date().toISOString(),
                marketplaceStatus: "Drafted",
                lastError: response.message
              };
            }

            failedCount += 1;
            return {
              ...item,
              status: "Needs Fix",
              marketplaceStatus: "Needs Fix",
              lastError: response.message
            };
          });

          setProducts(nextProducts);
          await saveProducts(nextProducts);

          if (response.published) {
            await chrome.tabs.remove(tab.id);
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

        if (index < readyProducts.length - 1) {
          await sleep(clampDelaySeconds(settings.autoPublishDelaySeconds) * 1000);
        }
      }

      setNotice({
        tone: failedCount > 0 ? "warn" : "ok",
        text: `Auto publish finished. Published ${publishedCount}, drafted ${draftedCount}, failed ${failedCount}.`
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
        <button className="danger" onClick={autoPublishQueue} disabled={isSyncing || isAutoPublishing || readyProducts.length === 0}>
          <Rocket size={17} />
          {isAutoPublishing ? "Publishing" : "Auto publish"}
        </button>
      </section>

      <nav className="status-tabs" aria-label="Product status">
        {statuses.map((status) => (
          <button key={status} className={status === activeStatus ? "active" : ""} onClick={() => updateStatus(status)}>
            {status}
          </button>
        ))}
      </nav>

      <section className="queue">
        {filteredProducts.map((product) => {
          const risk = productRisk(product);
          const blocked = risk.errors.length > 0 || duplicateIds.has(product.id);

          return (
            <button
              key={product.id}
              className={`product-row ${selectedProduct?.id === product.id ? "selected" : ""}`}
              onClick={() => setSelectedId(product.id)}
            >
              <span className={`status-dot ${statusClass(product.status)}`} />
              <span className="product-main">
                <strong>{product.title || "Untitled product"}</strong>
                <small>
                  {product.price} {product.currency} | {product.location || "Missing location"} | {product.category || "No category"}
                </small>
              </span>
              {blocked ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
            </button>
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
