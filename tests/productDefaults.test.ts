import { applyMarketplaceDefaults, getBlockingIssues } from "../src/domain/productDefaults";
import type { MarketplaceProduct } from "../src/domain/marketplaceProduct";

const product: MarketplaceProduct = {
  id: "page-1",
  status: "Ready",
  title: "Planter",
  description: "A detailed planter for indoor use with clean layered texture.",
  price: 39,
  currency: "ILS",
  category: "",
  condition: "New",
  location: "",
  images: [{ url: "https://example.com/planter.jpg", name: "planter.jpg" }]
};

describe("applyMarketplaceDefaults", () => {
  it("fills empty location, category, and currency from extension settings", () => {
    const result = applyMarketplaceDefaults(product, {
      defaultLocation: "Haifa",
      defaultCategory: "Home goods",
      defaultCurrency: "ILS"
    });

    expect(result.location).toBe("Haifa");
    expect(result.category).toBe("Home goods");
    expect(result.currency).toBe("ILS");
  });

  it("preserves product values when they already exist", () => {
    const result = applyMarketplaceDefaults(
      {
        ...product,
        location: "Jerusalem",
        category: "Decor",
        currency: "USD"
      },
      {
        defaultLocation: "Haifa",
        defaultCategory: "Home goods",
        defaultCurrency: "ILS"
      }
    );

    expect(result.location).toBe("Jerusalem");
    expect(result.category).toBe("Decor");
    expect(result.currency).toBe("USD");
  });
});

describe("getBlockingIssues", () => {
  it("returns blocking errors and duplicate messages unchanged", () => {
    const issues = getBlockingIssues({
      errors: ["Category is required."],
      duplicateMessages: ["Possible duplicate of page-2: same SKU"]
    });

    expect(issues).toEqual(["Category is required.", "Possible duplicate of page-2: same SKU"]);
  });
});
