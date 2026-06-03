import { findDuplicateProducts, validateMarketplaceProduct } from "../src/domain/productValidation";
import type { MarketplaceProduct } from "../src/domain/marketplaceProduct";

const baseProduct: MarketplaceProduct = {
  id: "page-1",
  status: "Ready",
  title: "Dragon phone stand - black PLA",
  description: "A sturdy 3D printed phone stand made from PLA. Pickup available in Tel Aviv.",
  price: 49,
  currency: "ILS",
  category: "Home goods",
  condition: "New",
  location: "Tel Aviv",
  images: [{ url: "https://example.com/dragon.jpg", name: "dragon.jpg" }],
  sku: "DRAGON-BLACK",
  material: "PLA",
  color: "Black",
  dimensions: "18x8x10 cm",
  printTime: "4h",
  customization: "Color options available",
  variantGroup: "dragon-stand"
};

describe("validateMarketplaceProduct", () => {
  it("accepts a complete physical 3D printed product", () => {
    const result = validateMarketplaceProduct(baseProduct);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("blocks risky prohibited marketplace terms before drafting", () => {
    const result = validateMarketplaceProduct({
      ...baseProduct,
      title: "3D printed airsoft gun replica",
      description: "A realistic weapon replica for display."
    });

    expect(result.errors).toContain("Potentially prohibited or restricted product wording: gun, weapon");
  });

  it("requires distinct variant details for similar 3D printed listings", () => {
    const result = validateMarketplaceProduct({
      ...baseProduct,
      color: undefined,
      material: undefined,
      variantGroup: "dragon-stand"
    });

    expect(result.warnings).toContain("Variant listings should include a distinct color or material.");
  });

  it("warns about a missing location without blocking the draft", () => {
    const result = validateMarketplaceProduct({
      ...baseProduct,
      location: ""
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      "Location is missing. Add Default location in Settings, map a Location field in Notion, or set it manually in Marketplace."
    );
  });
});

describe("findDuplicateProducts", () => {
  it("flags duplicate SKU/title/price combinations", () => {
    const duplicates = findDuplicateProducts([
      baseProduct,
      {
        ...baseProduct,
        id: "page-2",
        title: "Dragon Phone Stand Black PLA",
        sku: "DRAGON-BLACK"
      }
    ]);

    expect(duplicates).toEqual([
      {
        productId: "page-2",
        duplicateOf: "page-1",
        reasons: ["same SKU", "same normalized title and price", "same variant group"]
      }
    ]);
  });
});
