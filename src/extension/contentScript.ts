import { fillMarketplaceDraft } from "../marketplace/marketplaceDraft";
import type { DownloadImageResponse, ExtensionMessage, FillDraftMessage, FillDraftResponse } from "./messages";

const fetchImage: typeof fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  const response = (await chrome.runtime.sendMessage({
    type: "DOWNLOAD_IMAGE",
    url
  } satisfies ExtensionMessage)) as DownloadImageResponse;

  if (!response.ok || !response.bytes) {
    return new Response(response.message ?? "Image download failed.", { status: 502 });
  }

  return new Response(new Blob([new Uint8Array(response.bytes)], { type: response.mimeType ?? "image/jpeg" }), {
    status: 200
  });
};

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== "FILL_MARKETPLACE_DRAFT") {
    return false;
  }

  fillMarketplaceDraft(message.product, { fetchImage })
    .then((result) => {
      const response: FillDraftResponse = {
        ok: result.missingFields.length === 0,
        missingFields: result.missingFields,
        filledFields: result.filledFields,
        imageCount: result.imageCount,
        message:
          result.missingFields.length === 0
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
        message: error instanceof Error ? error.message : "Draft fill failed."
      } satisfies FillDraftResponse);
    });

  return true;
});
