import type { DuplicateFinding, MarketplaceProduct, ValidationResult } from "./marketplaceProduct";

const restrictedTerms = [
  "gun",
  "weapon",
  "firearm",
  "ammo",
  "ammunition",
  "medicine",
  "medical",
  "healthcare",
  "thermometer",
  "first aid",
  "animal",
  "pet",
  "alcohol",
  "tobacco",
  "drug",
  "recalled"
];

const normalizeText = (value: string | undefined): string => {
  if (!value) {
    return "";
  }

  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const findRestrictedTerms = (product: MarketplaceProduct): string[] => {
  const text = normalizeText(`${product.title} ${product.description} ${product.category}`);

  return restrictedTerms.filter((term) => {
    const normalizedTerm = normalizeText(term);
    return new RegExp(`(^|\\s)${normalizedTerm.replace(/\s+/g, "\\s+")}(\\s|$)`).test(text);
  });
};

export const validateMarketplaceProduct = (product: MarketplaceProduct): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!product.title.trim()) {
    errors.push("Title is required.");
  }

  if (!Number.isFinite(product.price) || product.price < 0) {
    errors.push("Price must be a valid positive number.");
  }

  if (product.description.trim().length < 25) {
    warnings.push("Description is short; add material, dimensions, pickup, and condition details.");
  }

  if (product.images.length === 0) {
    errors.push("At least one product image is required.");
  }

  if (!product.category.trim()) {
    errors.push("Category is required.");
  }

  if (!product.condition.trim()) {
    errors.push("Condition is required.");
  }

  if (!product.location.trim()) {
    warnings.push(
      "Location is missing. Add Default location in Settings, map a Location field in Notion, or set it manually in Marketplace."
    );
  }

  const hits = findRestrictedTerms(product);
  if (hits.length > 0) {
    errors.push(`Potentially prohibited or restricted product wording: ${hits.join(", ")}`);
  }

  if (product.variantGroup && !product.color && !product.material) {
    warnings.push("Variant listings should include a distinct color or material.");
  }

  return { errors, warnings };
};

const duplicateReasons = (current: MarketplaceProduct, previous: MarketplaceProduct): string[] => {
  const reasons: string[] = [];
  const currentSku = normalizeText(current.sku);
  const previousSku = normalizeText(previous.sku);

  if (currentSku && currentSku === previousSku) {
    reasons.push("same SKU");
  }

  if (normalizeText(current.title) === normalizeText(previous.title) && current.price === previous.price) {
    reasons.push("same normalized title and price");
  }

  if (current.variantGroup && current.variantGroup === previous.variantGroup) {
    reasons.push("same variant group");
  }

  const currentImage = current.images[0]?.url;
  const previousImage = previous.images[0]?.url;
  if (reasons.length < 2 && currentImage && currentImage === previousImage) {
    reasons.push("same primary image");
  }

  return reasons;
};

export const findDuplicateProducts = (products: MarketplaceProduct[]): DuplicateFinding[] => {
  const findings: DuplicateFinding[] = [];
  const seen: MarketplaceProduct[] = [];

  for (const product of products) {
    const match = seen.find((candidate) => duplicateReasons(product, candidate).length >= 2);
    if (match) {
      findings.push({
        productId: product.id,
        duplicateOf: match.id,
        reasons: duplicateReasons(product, match)
      });
    }

    seen.push(product);
  }

  return findings;
};
