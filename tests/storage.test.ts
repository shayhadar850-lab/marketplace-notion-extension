import { loadState, saveSettings, type ExtensionSettings } from "../src/extension/storage";

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
  });

  it("persists the auto publish delay in settings", async () => {
    const settings: ExtensionSettings = {
      notionToken: "ntn_test",
      databaseId: "database-id",
      defaultCurrency: "ILS",
      defaultLocation: "Tel Aviv",
      defaultCategory: "Home goods",
      autoPublishDelaySeconds: 45
    };

    await saveSettings(settings);
    const state = await loadState();

    expect(state.settings.autoPublishDelaySeconds).toBe(45);
  });
});
