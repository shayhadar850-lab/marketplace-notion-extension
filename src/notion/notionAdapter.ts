import type { MarketplaceImage, MarketplaceProduct, MarketplaceStatus } from "../domain/marketplaceProduct";

type Fetcher = typeof fetch;

type QueryOptions = {
  token: string;
  databaseId: string;
  fetcher?: Fetcher;
  wait?: (milliseconds: number) => Promise<void>;
};

type NotionRichText = {
  plain_text?: string;
};

type NotionFile = {
  name?: string;
  file?: { url?: string };
  external?: { url?: string };
};

type NotionProperty = {
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  number?: number | null;
  files?: NotionFile[];
  url?: string | null;
  checkbox?: boolean;
};

type NotionPage = {
  id: string;
  properties: Record<string, NotionProperty | undefined>;
};

type NotionListResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor?: string;
};

const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init);
const defaultWait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const readText = (property: NotionProperty | undefined): string => {
  if (!property) {
    return "";
  }

  const values = property.title ?? property.rich_text ?? [];
  return values.map((value) => value.plain_text ?? "").join("").trim();
};

const readSelect = (property: NotionProperty | undefined): string => {
  if (!property) {
    return "";
  }

  return property.status?.name ?? property.select?.name ?? "";
};

const readNumber = (property: NotionProperty | undefined): number => {
  if (!property || typeof property.number !== "number") {
    return 0;
  }

  return property.number;
};

const readCheckbox = (property: NotionProperty | undefined): boolean => property?.checkbox === true;

const firstText = (properties: Record<string, NotionProperty | undefined>, names: string[]): string => {
  for (const name of names) {
    const value = readText(properties[name]) || readSelect(properties[name]) || properties[name]?.url || "";
    if (value) {
      return value;
    }
  }

  return "";
};

const firstImages = (properties: Record<string, NotionProperty | undefined>, names: string[]): MarketplaceImage[] => {
  for (const name of names) {
    const images = readImages(properties[name]);
    if (images.length > 0) {
      return images;
    }
  }

  return [];
};

const mapStatus = (properties: Record<string, NotionProperty | undefined>): MarketplaceStatus => {
  if (readCheckbox(properties["Posted to Social"])) {
    return "Published";
  }

  if (readCheckbox(properties["Publishing in Social"])) {
    return "Drafted";
  }

  const status = firstText(properties, ["Status", "Workflow Stage"]);
  if (status === "Ready" || status === "Needs Fix" || status === "Drafted" || status === "Published") {
    return status;
  }

  if (status === "Scraped" || status === "Imported") {
    return "Ready";
  }

  if (readCheckbox(properties["Approved for Posting"])) {
    return "Ready";
  }

  return "Needs Fix";
};

const readImages = (property: NotionProperty | undefined): MarketplaceImage[] => {
  if (!property?.files) {
    return [];
  }

  return property.files
    .map((file, index) => ({
      name: file.name ?? `image-${index + 1}.jpg`,
      url: file.file?.url ?? file.external?.url ?? ""
    }))
    .filter((image) => image.url);
};

const mapPageToProduct = (page: NotionPage): MarketplaceProduct => {
  const properties = page.properties;
  const status = mapStatus(properties);

  return {
    id: page.id,
    status,
    sourceStatus: status,
    title: firstText(properties, ["Title", "Model Name", "Headlines"]),
    description: firstText(properties, ["Description", "תיאור המוצר", "Social Copy (IG/TikTok)"]),
    price: readNumber(properties.Price),
    currency: "ILS",
    category: firstText(properties, ["Category"]),
    condition: firstText(properties, ["Condition"]) || "New",
    location: firstText(properties, ["Location"]),
    images: firstImages(properties, ["Images", "Original Images", "Marketing Assets"]),
    sku: firstText(properties, ["SKU", "Source Link"]) || undefined,
    material: readSelect(properties.Material) || readText(properties.Material) || undefined,
    color: readSelect(properties.Color) || readText(properties.Color) || undefined,
    dimensions: readText(properties.Dimensions) || undefined,
    printTime: readText(properties["Print Time"]) || undefined,
    customization: readText(properties.Customization) || undefined,
    variantGroup: readText(properties["Variant Group"]) || undefined,
    draftedAt: readText(properties["Drafted At"]) || undefined,
    publishedUrl: (properties["Published URL"]?.url ?? readText(properties["Published URL"])) || undefined,
    marketplaceStatus: readSelect(properties["Marketplace Status"]) || undefined,
    lastError: readText(properties["Last Error"]) || undefined
  };
};

const queryPage = async (
  options: Required<Pick<QueryOptions, "fetcher" | "wait">> & Pick<QueryOptions, "token" | "databaseId">,
  startCursor?: string
): Promise<NotionListResponse> => {
  const response = await options.fetcher(`https://api.notion.com/v1/data_sources/${options.databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11"
    },
    body: JSON.stringify(startCursor ? { start_cursor: startCursor } : {})
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
    await options.wait(Math.max(retryAfter, 1) * 1000);
    return queryPage(options, startCursor);
  }

  if (response.status === 404) {
    throw new Error("Notion data source not found or not shared with this integration.");
  }

  if (!response.ok) {
    throw new Error(`Notion request failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<NotionListResponse>;
};

export const queryNotionProducts = async (options: QueryOptions): Promise<MarketplaceProduct[]> => {
  const fetcher = options.fetcher ?? defaultFetcher;
  const wait = options.wait ?? defaultWait;
  const products: MarketplaceProduct[] = [];
  let cursor: string | undefined;

  do {
    const page = await queryPage({ ...options, fetcher, wait }, cursor);
    products.push(...page.results.map(mapPageToProduct));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  return products;
};
