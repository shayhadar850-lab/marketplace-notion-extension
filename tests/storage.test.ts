import { loadState, saveSelectedAutoPublishIds, saveSettings, type ExtensionSettings } from "../src/extension/storage";

const storageState: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(storageState)) {
    delete storageState[key];
  }

  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in storageState) {
              result[key] = storageState[key];
            }
          }

          return result;
        }),
        set: vi.fn(async (value: Record<string, unknown>) => {
          Object.assign(storageState, value);
        })
      }
    }
  });
});

describe("extension storage", () => {
  it("loads the default auto publish delay when nothing was stored yet", async () => {
    const state = await loadState();

    expect(state.settings.autoPublishDelaySeconds).toBe(30);
    expect(state.settings.formStepDelaySeconds).toBe(2);
    expect(state.settings.activeMarketplaceAccountKey).toBe("");
    expect(state.settings.activeMarketplaceAccountLabel).toBe("");
    expect(state.settings.maxAutoPublishPerSession).toBe(5);
    expect(state.selectedAutoPublishIds).toEqual([]);
  });

  it("persists the auto publish delay in settings", async () => {
    const settings: ExtensionSettings = {
      notionToken: "ntn_test",
      databaseId: "database-id",
      defaultCurrency: "ILS",
      defaultLocation: "Tel Aviv",
      defaultCategory: "Home goods",
      activeMarketplaceAccountKey: "statica statica",
      activeMarketplaceAccountLabel: "Statica Statica",
      autoPublishDelaySeconds: 45,
      formStepDelaySeconds: 4,
      maxAutoPublishPerSession: 7
    };

    await saveSettings(settings);
    const state = await loadState();

    expect(state.settings.autoPublishDelaySeconds).toBe(45);
    expect(state.settings.formStepDelaySeconds).toBe(4);
    expect(state.settings.activeMarketplaceAccountKey).toBe("statica statica");
    expect(state.settings.activeMarketplaceAccountLabel).toBe("Statica Statica");
    expect(state.settings.maxAutoPublishPerSession).toBe(7);
  });

  it("persists the manually selected auto publish queue", async () => {
    await saveSelectedAutoPublishIds(["page-1", "page-3"]);

    const state = await loadState();

    expect(state.selectedAutoPublishIds).toEqual(["page-1", "page-3"]);
  });
});
