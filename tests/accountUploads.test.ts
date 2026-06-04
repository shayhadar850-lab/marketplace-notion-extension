import {
  baseMarketplaceStatus,
  hasAccountUpload,
  recordAccountUpload,
  resolveMarketplaceStatus
} from "../src/domain/accountUploads";
import type { MarketplaceProduct } from "../src/domain/marketplaceProduct";

const makeProduct = (status: MarketplaceProduct["status"] = "Ready"): MarketplaceProduct => ({
  id: "page-1",
  status,
  title: "Dragon phone stand",
  description: "A detailed Marketplace listing for a 3D printed phone stand.",
  price: 49,
  currency: "ILS",
  category: "Home goods",
  condition: "New",
  location: "Tel Aviv",
  images: [{ url: "https://example.com/dragon.jpg", name: "dragon.jpg" }]
});

describe("account uploads", () => {
  it("keeps account uploads scoped to the detected account", () => {
    const product = recordAccountUpload(
      makeProduct(),
      { key: "statica statica", label: "Statica Statica" },
      "Published",
      "https://facebook.com/marketplace/item/1"
    );

    expect(hasAccountUpload(product, "statica statica")).toBe(true);
    expect(hasAccountUpload(product, "another shop")).toBe(false);
    expect(resolveMarketplaceStatus(product, "statica statica")).toBe("Published");
    expect(resolveMarketplaceStatus(product, "another shop")).toBe("Ready");
  });

  it("preserves the base workflow status when local account uploads exist", () => {
    const draftedProduct = makeProduct("Drafted");

    expect(baseMarketplaceStatus(draftedProduct)).toBe("Ready");

    const uploaded = recordAccountUpload(
      draftedProduct,
      { key: "statica statica", label: "Statica Statica" },
      "Drafted"
    );

    expect(uploaded.sourceStatus).toBe("Ready");
    expect(resolveMarketplaceStatus(uploaded, "statica statica")).toBe("Drafted");
    expect(resolveMarketplaceStatus(uploaded, "other account")).toBe("Ready");
  });
});
