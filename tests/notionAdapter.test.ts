import { queryNotionProducts } from "../src/notion/notionAdapter";

const notionPage = (id: string, title: string) => ({
  id,
  properties: {
    Status: { select: { name: "Ready" } },
    Title: { title: [{ plain_text: title }] },
    Description: { rich_text: [{ plain_text: "A detailed 3D printed item for local pickup." }] },
    Price: { number: 79 },
    Images: { files: [{ name: "item.jpg", file: { url: "https://cdn.example.com/item.jpg" } }] },
    Category: { select: { name: "Home goods" } },
    Condition: { select: { name: "New" } },
    Location: { rich_text: [{ plain_text: "Tel Aviv" }] },
    SKU: { rich_text: [{ plain_text: "SKU-1" }] },
    Material: { select: { name: "PLA" } },
    Color: { select: { name: "Blue" } },
    Dimensions: { rich_text: [{ plain_text: "10x10x10 cm" }] },
    "Print Time": { rich_text: [{ plain_text: "3h" }] },
    Customization: { rich_text: [{ plain_text: "Available by request" }] },
    "Variant Group": { rich_text: [{ plain_text: "phone-stand" }] }
  }
});

const makerWorldPage = {
  id: "maker-page-1",
  properties: {
    "Workflow Stage": { status: { name: "Ready" } },
    "Approved for Posting": { checkbox: true },
    "Model Name": { title: [{ plain_text: "Parametric cable clip" }] },
    "תיאור המוצר": { rich_text: [{ plain_text: "A useful 3D printed cable clip for desk organization." }] },
    Price: { number: 25 },
    "Original Images": { files: [{ name: "clip.jpg", external: { url: "https://cdn.example.com/clip.jpg" } }] },
    Category: { select: { name: "Home goods" } },
    "Source Link": { url: "https://makerworld.com/model/123" }
  }
};

describe("queryNotionProducts", () => {
  it("paginates Notion database results and maps products", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [notionPage("page-1", "Phone stand")], has_more: true, next_cursor: "next" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [notionPage("page-2", "Cable holder")], has_more: false })
      });

    const products = await queryNotionProducts({
      token: "ntn_test",
      databaseId: "database-id",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toContain("/v1/data_sources/database-id/query");
    expect(products.map((product) => product.title)).toEqual(["Phone stand", "Cable holder"]);
  });

  it("maps the MakerWorld pipeline fields currently shared with the integration", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [makerWorldPage], has_more: false })
    });

    const products = await queryNotionProducts({
      token: "ntn_test",
      databaseId: "data-source-id",
      fetcher
    });

    expect(products[0]).toMatchObject({
      id: "maker-page-1",
      status: "Ready",
      title: "Parametric cable clip",
      description: "A useful 3D printed cable clip for desk organization.",
      price: 25,
      category: "Home goods",
      condition: "New",
      sku: "https://makerworld.com/model/123"
    });
    expect(products[0].images).toEqual([{ name: "clip.jpg", url: "https://cdn.example.com/clip.jpg" }]);
  });

  it("uses a bound default fetcher in browser contexts", async () => {
    vi.stubGlobal(
      "fetch",
      function (this: typeof globalThis) {
        if (this !== globalThis) {
          throw new TypeError("Illegal invocation");
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [notionPage("page-1", "Phone stand")], has_more: false })
        });
      } as unknown as typeof fetch
    );

    const products = await queryNotionProducts({
      token: "ntn_test",
      databaseId: "data-source-id"
    });

    expect(products[0].title).toBe("Phone stand");
  });

  it("waits for Retry-After when Notion returns 429", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => "2" },
        text: async () => "rate limited"
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [notionPage("page-1", "Phone stand")], has_more: false })
      });

    const products = await queryNotionProducts({
      token: "ntn_test",
      databaseId: "database-id",
      fetcher,
      wait
    });

    expect(wait).toHaveBeenCalledWith(2000);
    expect(products).toHaveLength(1);
  });

  it("reports missing database access clearly", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => "Could not find database"
    });

    await expect(
      queryNotionProducts({
        token: "ntn_test",
        databaseId: "database-id",
        fetcher
      })
    ).rejects.toThrow("Notion data source not found or not shared with this integration.");
  });
});
