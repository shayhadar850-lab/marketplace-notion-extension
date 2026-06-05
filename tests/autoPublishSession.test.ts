import { clampSessionLimit, limitAutoPublishProducts } from "../src/domain/autoPublishSession";
import type { MarketplaceProduct } from "../src/domain/marketplaceProduct";

const makeProduct = (id: string, status: MarketplaceProduct["status"]): MarketplaceProduct => ({
  id,
  status,
  title: `Product ${id}`,
  description: "A detailed product description for Marketplace.",
  price: 49,
  currency: "ILS",
  category: "Home goods",
  condition: "New",
  location: "Tel Aviv",
  images: [{ url: `https://example.com/${id}.jpg`, name: `${id}.jpg` }]
});

describe("auto publish session", () => {
  it("limits the ready queue to the configured session size", () => {
    const products = [
      makeProduct("1", "Ready"),
      makeProduct("2", "Ready"),
      makeProduct("3", "Drafted"),
      makeProduct("4", "Ready")
    ];

    const result = limitAutoPublishProducts(products, 2, ["1", "2", "4"]);

    expect(result.map((product) => product.id)).toEqual(["1", "2"]);
  });

  it("only includes manually selected ready products", () => {
    const products = [
      makeProduct("1", "Ready"),
      makeProduct("2", "Needs Fix"),
      makeProduct("3", "Ready"),
      makeProduct("4", "Published")
    ];

    const result = limitAutoPublishProducts(products, 5, ["2", "3", "4"]);

    expect(result.map((product) => product.id)).toEqual(["3"]);
  });

  it("returns an empty queue when nothing was selected", () => {
    const products = [makeProduct("1", "Ready"), makeProduct("2", "Ready")];

    const result = limitAutoPublishProducts(products, 5, []);

    expect(result).toEqual([]);
  });

  it("clamps the session limit to a safe positive number", () => {
    expect(clampSessionLimit(-5)).toBe(1);
    expect(clampSessionLimit(999)).toBe(100);
    expect(clampSessionLimit(Number.NaN)).toBe(5);
  });
});
