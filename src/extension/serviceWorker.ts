import type { DownloadImageMessage, DownloadImageResponse, ExtensionMessage } from "./messages";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.windowId) {
    return;
  }

  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== "DOWNLOAD_IMAGE") {
    return false;
  }

  downloadImage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : "Image download failed."
      } satisfies DownloadImageResponse);
    });

  return true;
});

const downloadImage = async (message: DownloadImageMessage): Promise<DownloadImageResponse> => {
  const response = await fetch(message.url);
  if (!response.ok) {
    return {
      ok: false,
      message: `Image request failed: ${response.status}`
    };
  }

  const blob = await response.blob();
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));

  return {
    ok: true,
    bytes,
    mimeType: blob.type || response.headers.get("content-type") || "image/jpeg"
  };
};
