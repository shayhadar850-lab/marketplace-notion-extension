import { fillMarketplaceDraft } from "../marketplace/marketplaceDraft";
import type {
  DownloadImageResponse,
  ExtensionMessage,
  FillDraftMessage,
  FillDraftResponse,
  MarketplaceAccountResponse
} from "./messages";

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [metadata, base64 = ""] = dataUrl.split(",");
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

const fetchImage: typeof fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  const response = (await chrome.runtime.sendMessage({
    type: "DOWNLOAD_IMAGE",
    url
  } satisfies ExtensionMessage)) as DownloadImageResponse;

  if (!response.ok || (!response.dataUrl && !response.bytes)) {
    return new Response(response.message ?? "Image download failed.", { status: 502 });
  }

  if (response.dataUrl) {
    return new Response(dataUrlToBlob(response.dataUrl), { status: 200 });
  }

  const bytes = response.bytes ?? [];
  return new Response(new Blob([new Uint8Array(bytes)], { type: response.mimeType ?? "image/jpeg" }), {
    status: 200
  });
};

const ignoredAccountTexts = new Set([
  "marketplace",
  "פריט למכירה",
  "תצוגה מקדימה",
  "שירותי טיוטה",
  "הוסף תמונות",
  "נדרש",
  "הבא",
  "פרסם",
  "מצב",
  "קטגוריה",
  "מחיר",
  "כותרת"
]);

const normalizeAccountText = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const accountKey = (value: string): string =>
  normalizeAccountText(value)
    .replace(/[^a-z0-9\u0590-\u05ff ]+/g, "")
    .trim();

const looksLikeAccountName = (value: string): boolean => {
  const normalized = normalizeAccountText(value);
  if (!normalized || ignoredAccountTexts.has(normalized) || normalized.length < 3 || normalized.length > 60) {
    return false;
  }

  if (!/[a-z\u0590-\u05ff]/i.test(normalized)) {
    return false;
  }

  if (/\d{2,}/.test(normalized)) {
    return false;
  }

  const words = normalized.split(" ").filter(Boolean);
  return words.length >= 1 && words.length <= 4;
};

const isVisibleElement = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return !element.hidden && element.getAttribute("aria-hidden") !== "true";
};

const detectMarketplaceAccount = (): MarketplaceAccountResponse => {
  const textCounts = new Map<string, number>();
  const originalTexts = new Map<string, string>();

  for (const element of Array.from(document.querySelectorAll("span, strong, h1, h2, h3, h4, a, div"))) {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      continue;
    }

    const text = element.innerText.trim();
    if (!looksLikeAccountName(text)) {
      continue;
    }

    const key = accountKey(text);
    if (!key) {
      continue;
    }

    textCounts.set(key, (textCounts.get(key) ?? 0) + 1);
    originalTexts.set(key, text);
  }

  const bestCandidate = Array.from(textCounts.entries())
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)[0];

  if (!bestCandidate || bestCandidate[1] < 2) {
    return {
      ok: false,
      message: "Could not detect the active Marketplace account from this page."
    };
  }

  return {
    ok: true,
    accountKey: bestCandidate[0],
    accountLabel: originalTexts.get(bestCandidate[0]) ?? bestCandidate[0]
  };
};

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "GET_MARKETPLACE_ACCOUNT") {
    sendResponse(detectMarketplaceAccount());
    return false;
  }

  if (message.type !== "FILL_MARKETPLACE_DRAFT") {
    return false;
  }

  fillMarketplaceDraft(message.product, { fetchImage, publish: message.publish, stepDelayMs: message.stepDelayMs })
    .then((result) => {
      const ok = message.publish ? result.published && result.missingFields.length === 0 : result.missingFields.length === 0;
      const response: FillDraftResponse = {
        ok,
        missingFields: result.missingFields,
        filledFields: result.filledFields,
        imageCount: result.imageCount,
        published: result.published,
        imageDebug: result.imageDebug,
        message:
          result.published && result.missingFields.length === 0
            ? "Draft filled and published."
            : result.missingFields.length === 0
              ? "Draft filled. Review it carefully, then publish manually."
              : `Draft partially filled. Missing fields: ${result.missingFields.join(", ")}`
      };
      sendResponse(response);
    })
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        missingFields: [],
        filledFields: [],
        imageCount: 0,
        published: false,
        imageDebug: [],
        message: error instanceof Error ? error.message : "Draft fill failed."
      } satisfies FillDraftResponse);
    });

  return true;
});
