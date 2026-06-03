import type { MarketplaceProduct } from "../domain/marketplaceProduct";

export type DraftResult = {
  filledFields: string[];
  missingFields: string[];
  imageCount: number;
  published: boolean;
};

type FillOptions = {
  fetchImage?: typeof fetch;
  publish?: boolean;
};

type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const fillableSelector =
  "input, textarea, [contenteditable], [role='textbox'], [role='combobox'], [data-lexical-editor]";

const fieldSelectors: Record<string, string[]> = {
  title: ['input[name="title"]'],
  price: ['input[name="price"]'],
  description: ['textarea[name="description"]', "textarea"],
  location: ['input[name="location"]']
};

const fieldMatchers: Record<string, string[]> = {
  title: ["title", "listing title", "item title", "\u05db\u05d5\u05ea\u05e8\u05ea"],
  price: ["price", "\u05de\u05d7\u05d9\u05e8"],
  description: ["description", "\u05ea\u05d9\u05d0\u05d5\u05e8"],
  location: ["location", "\u05de\u05d9\u05e7\u05d5\u05dd"],
  category: ["category", "\u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4"],
  condition: ["condition", "\u05de\u05e6\u05d1"]
};

const additionalDetailsMatchers = [
  "additional details",
  "more details",
  "details can help",
  "\u05e4\u05e8\u05d8\u05d9\u05dd \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd",
  "\u05dc\u05e2\u05d6\u05d5\u05e8 \u05dc\u05de\u05e9\u05d5\u05da",
  "\u05dc\u05de\u05e9\u05d5\u05da \u05d9\u05d5\u05ea\u05e8"
];

const imageUploadMatchers = [
  "photo",
  "photos",
  "image",
  "upload",
  "add photo",
  "add photos",
  "\u05ea\u05de\u05d5\u05e0\u05d4",
  "\u05ea\u05de\u05d5\u05e0\u05d5\u05ea",
  "\u05d4\u05d5\u05e1\u05e3 \u05ea\u05de\u05d5\u05e0\u05d4",
  "\u05d4\u05d5\u05e1\u05e3 \u05ea\u05de\u05d5\u05e0\u05d5\u05ea",
  "\u05d4\u05e2\u05dc\u05d0\u05ea \u05ea\u05de\u05d5\u05e0\u05d5\u05ea"
];

const dropdownSearchMatchers = [
  "search",
  "search categories",
  "category search",
  "\u05d7\u05d9\u05e4\u05d5\u05e9",
  "\u05d7\u05e4\u05e9",
  "\u05d7\u05d9\u05e4\u05d5\u05e9 \u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d5\u05ea",
  "\u05d7\u05e4\u05e9 \u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4"
];

const nextStepMatchers = ["next", "continue", "\u05d4\u05d1\u05d0", "\u05d4\u05de\u05e9\u05da"];
const publishMatchers = ["publish", "post", "submit", "\u05e4\u05e8\u05e1\u05dd", "\u05e4\u05e8\u05e1\u05d5\u05dd"];

const labelText = (element: Element): string => element.textContent?.toLocaleLowerCase().trim() ?? "";

const normalize = (value: string | null | undefined): string => (value ?? "").toLocaleLowerCase().trim();

const includesMatcher = (value: string | null | undefined, matchers: string[]): boolean => {
  const normalizedValue = normalize(value);
  return matchers.some((matcher) => normalizedValue.includes(normalize(matcher)));
};

const isFillableElement = (element: Element): element is FillableElement => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }

  const contentEditable = element.getAttribute("contenteditable");

  return (
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      (contentEditable !== null && contentEditable !== "false") ||
      element.getAttribute("role") === "textbox" ||
      element.getAttribute("role") === "combobox" ||
      element.hasAttribute("data-lexical-editor"))
  );
};

const isVisibleElement = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return !element.hidden && element.getAttribute("aria-hidden") !== "true";
};

const referencedText = (element: Element): string => {
  const ids = `${element.getAttribute("aria-labelledby") ?? ""} ${element.getAttribute("aria-describedby") ?? ""}`
    .split(/\s+/)
    .filter(Boolean);

  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .filter(Boolean)
    .join(" ");
};

const findInputByLabel = (matchers: string[], selector = fillableSelector): FillableElement | null => {
  const labels = Array.from(document.querySelectorAll("label"));
  const matchingLabel = labels.find((element) => includesMatcher(labelText(element), matchers));

  const field = matchingLabel?.querySelector(selector);
  return field && isFillableElement(field) ? field : null;
};

const findFieldByAttributes = (matchers: string[]): FillableElement | null => {
  const candidates = Array.from(document.querySelectorAll(fillableSelector));
  const matchingCandidate = candidates.find((element) => {
    if (!isFillableElement(element) || !isVisibleElement(element)) {
      return false;
    }

    return (
      includesMatcher(element.getAttribute("aria-label"), matchers) ||
      includesMatcher(element.getAttribute("aria-placeholder"), matchers) ||
      includesMatcher(element.getAttribute("placeholder"), matchers) ||
      includesMatcher(element.getAttribute("name"), matchers) ||
      includesMatcher(referencedText(element), matchers)
    );
  });

  return matchingCandidate && isFillableElement(matchingCandidate) ? matchingCandidate : null;
};

const findFieldByNearbyText = (matchers: string[]): FillableElement | null => {
  const candidates = Array.from(document.querySelectorAll(fillableSelector));
  const matchingCandidate = candidates.find((element) => {
    if (!isFillableElement(element) || !isVisibleElement(element)) {
      return false;
    }

    const nearbyText = [
      element.previousElementSibling?.textContent ?? "",
      element.nextElementSibling?.textContent ?? "",
      element.parentElement && element.parentElement !== document.body ? element.parentElement.textContent ?? "" : ""
    ].join(" ");

    return includesMatcher(nearbyText, matchers);
  });

  return matchingCandidate && isFillableElement(matchingCandidate) ? matchingCandidate : null;
};

const hasFieldIdentity = (element: Element, field: string): boolean => {
  const matchers = fieldMatchers[field] ?? [field];
  const fieldText = [
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("aria-placeholder") ?? "",
    element.getAttribute("placeholder") ?? "",
    element.getAttribute("name") ?? "",
    referencedText(element)
  ].join(" ");

  return includesMatcher(fieldText, matchers);
};

const hasFilledValue = (element: FillableElement): boolean => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value.trim().length > 0;
  }

  return (element.textContent ?? "").trim().length > 0;
};

const findDescriptionFallback = (): FillableElement | null => {
  const candidates = Array.from(document.querySelectorAll(fillableSelector));
  const editorCandidates = candidates.filter((element): element is FillableElement => {
    if (!isFillableElement(element) || !isVisibleElement(element) || hasFilledValue(element)) {
      return false;
    }

    if (element instanceof HTMLInputElement && element.type !== "text" && element.type !== "search") {
      return false;
    }

    const role = element.getAttribute("role");
    const editable = element.getAttribute("contenteditable");
    const isTextEditor =
      element instanceof HTMLTextAreaElement ||
      role === "textbox" ||
      element.hasAttribute("data-lexical-editor") ||
      (editable !== null && editable !== "false");

    if (!isTextEditor) {
      return false;
    }

    return !["title", "price", "location"].some((field) => hasFieldIdentity(element, field));
  });

  const nonInputEditor = editorCandidates.find((element) => !(element instanceof HTMLInputElement));
  return nonInputEditor ?? editorCandidates[0] ?? null;
};

const waitForUiUpdate = () => new Promise<void>((resolve) => setTimeout(resolve, 75));

const dispatchTrustedLikeClick = (element: HTMLElement) => {
  if (typeof PointerEvent !== "undefined") {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  }
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  if (typeof PointerEvent !== "undefined") {
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  }
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  element.click();
};

const pushUnique = (target: string[], ...values: string[]) => {
  for (const value of values) {
    if (!value.trim() || target.includes(value)) {
      continue;
    }

    target.push(value);
  }
};

const categoryOptionAliases = (value: string, product?: MarketplaceProduct): string[] => {
  const normalizedValue = normalize(value);
  const context = normalize(`${value} ${product?.title ?? ""} ${product?.description ?? ""}`);
  const aliases: string[] = [];

  if (
    context.includes("planter") ||
    context.includes("plant") ||
    context.includes("garden") ||
    context.includes("flower") ||
    context.includes("\u05d0\u05d3\u05e0\u05d9\u05ea") ||
    context.includes("\u05e2\u05e6\u05d9\u05e5") ||
    context.includes("\u05e6\u05de\u05d7") ||
    context.includes("\u05d2\u05df")
  ) {
    pushUnique(aliases, "\u05d2\u05df", "\u05d2\u05d9\u05e0\u05d4", "\u05d1\u05d9\u05ea \u05d5\u05d2\u05df");
  }

  if (normalizedValue.includes("decor") || normalizedValue.includes("home")) {
    pushUnique(
      aliases,
      "\u05de\u05e9\u05e7 \u05d1\u05d9\u05ea",
      "\u05db\u05dc\u05d9 \u05d1\u05d9\u05ea",
      "\u05e2\u05d9\u05e6\u05d5\u05d1 \u05d4\u05d1\u05d9\u05ea",
      "\u05e8\u05d9\u05d4\u05d5\u05d8",
      "\u05d1\u05d9\u05ea \u05d5\u05d2\u05df"
    );
  }

  if (normalizedValue.includes("garden")) {
    pushUnique(aliases, "\u05d2\u05df", "\u05d2\u05d9\u05e0\u05d4", "\u05d1\u05d9\u05ea \u05d5\u05d2\u05df");
  }

  pushUnique(aliases, value);
  return aliases;
};

const optionAliases = (field: string, value: string, product?: MarketplaceProduct): string[] => {
  const normalizedValue = normalize(value);

  if (field === "condition" && (normalizedValue === "new" || normalizedValue === "\u05d7\u05d3\u05e9")) {
    return ["new", "\u05d7\u05d3\u05e9"];
  }

  if (field === "category") {
    return categoryOptionAliases(value, product);
  }

  return [value];
};

const expandAdditionalDetails = async (): Promise<boolean> => {
  const controls = Array.from(document.querySelectorAll("button, [role='button'], [aria-expanded]"));
  const control = controls.find((element) => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      return false;
    }

    const controlText = [
      element.textContent ?? "",
      element.getAttribute("aria-label") ?? "",
      referencedText(element)
    ].join(" ");

    return includesMatcher(controlText, additionalDetailsMatchers);
  });

  if (!(control instanceof HTMLElement)) {
    return false;
  }

  control.click();
  await waitForUiUpdate();
  return true;
};

const findField = (field: string): FillableElement | null => {
  const direct = document.querySelector<FillableElement>(fieldSelectors[field]?.join(",") ?? "");
  if (direct) {
    return direct;
  }

  const matchers = fieldMatchers[field] ?? [field];
  const matchedField = findFieldByAttributes(matchers) ?? findInputByLabel(matchers) ?? findFieldByNearbyText(matchers);
  if (matchedField) {
    return matchedField;
  }

  if (field === "description") {
    return findDescriptionFallback();
  }

  return null;
};

const findFieldAfterReveal = async (field: string): Promise<FillableElement | null> => {
  const element = findField(field);
  if (element || field !== "description") {
    return element;
  }

  const expanded = await expandAdditionalDetails();
  if (!expanded) {
    return null;
  }

  return findField(field);
};

const findDropdownControl = (field: string): HTMLElement | null => {
  const matchers = fieldMatchers[field] ?? [field];
  const controls = Array.from(
    document.querySelectorAll("button, [role='button'], [role='combobox'], [aria-haspopup]")
  );
  const control = controls.find((element) => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      return false;
    }

    const text = [
      element.textContent ?? "",
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("placeholder") ?? "",
      referencedText(element)
    ].join(" ");

    return includesMatcher(text, matchers);
  });

  return control instanceof HTMLElement ? control : null;
};

const isDisabledElement = (element: Element): boolean => {
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) {
    return element.disabled;
  }

  return element.getAttribute("aria-disabled") === "true";
};

const actionButtonText = (element: Element): string =>
  [
    element.textContent ?? "",
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("value") ?? "",
    referencedText(element)
  ].join(" ");

const findActionButton = (matchers: string[]): HTMLElement | null => {
  const candidates = Array.from(
    document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']")
  );
  const matchingButton = candidates.find((element) => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element) || isDisabledElement(element)) {
      return false;
    }

    return includesMatcher(actionButtonText(element), matchers);
  });

  return matchingButton instanceof HTMLElement ? matchingButton : null;
};

const optionSelector = "[role='option'], [role='menuitem'], [role='radio'], [aria-selected], span, div";

const optionTextMatchesExactly = (value: string | null | undefined, aliases: string[]): boolean => {
  const normalizedValue = normalize(value);
  return aliases.some((alias) => normalizedValue === normalize(alias));
};

const optionTextMatchesLoosely = (value: string | null | undefined, aliases: string[]): boolean =>
  includesMatcher(value, aliases);

const optionClickTarget = (element: HTMLElement): HTMLElement => {
  const actionable = element.closest<HTMLElement>("[role='option'], [role='menuitem'], [role='radio'], [role='button'], [aria-selected]");
  return actionable ?? element;
};

const findOption = (aliases: string[], excludedTexts: Set<string> = new Set()): HTMLElement | null => {
  const options = Array.from(document.querySelectorAll(optionSelector));
  const visibleOptions = options.filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      return false;
    }

    return !excludedTexts.has(normalize(element.textContent));
  });

  const exactOption = visibleOptions.find((element) => optionTextMatchesExactly(element.textContent, aliases));
  if (exactOption) {
    return optionClickTarget(exactOption);
  }

  const looseOption = visibleOptions.find((element) => optionTextMatchesLoosely(element.textContent, aliases));
  return looseOption ? optionClickTarget(looseOption) : null;
};

const findDropdownSearchField = (): FillableElement | null => {
  const candidates = Array.from(document.querySelectorAll(fillableSelector));
  const matchingCandidate = candidates.find((element) => {
    if (!isFillableElement(element) || !isVisibleElement(element)) {
      return false;
    }

    if (["title", "price", "description", "location"].some((field) => hasFieldIdentity(element, field))) {
      return false;
    }

    const text = [
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("aria-placeholder") ?? "",
      element.getAttribute("placeholder") ?? "",
      element.getAttribute("name") ?? "",
      referencedText(element)
    ].join(" ");

    return includesMatcher(text, dropdownSearchMatchers);
  });

  return matchingCandidate && isFillableElement(matchingCandidate) ? matchingCandidate : null;
};

const searchDropdownOptions = async (aliases: string[], excludedTexts: Set<string>): Promise<HTMLElement | null> => {
  const searchField = findDropdownSearchField();
  if (!searchField) {
    return null;
  }

  const searchTerms = aliases.filter((alias) => alias.trim().length > 0);
  for (const term of searchTerms) {
    setNativeValue(searchField, term);
    await waitForUiUpdate();

    const option = findOption(aliases, excludedTexts);
    if (option) {
      return option;
    }
  }

  return null;
};

type DropdownSelection = {
  attempted: boolean;
  selected: boolean;
};

const dropdownText = (control: HTMLElement): string =>
  [
    control.textContent ?? "",
    control.getAttribute("aria-label") ?? "",
    control.getAttribute("aria-valuetext") ?? "",
    control.getAttribute("title") ?? "",
    referencedText(control)
  ].join(" ");

const selectDropdownValue = async (field: string, value: string, product?: MarketplaceProduct): Promise<DropdownSelection> => {
  if (!value.trim()) {
    return { attempted: false, selected: true };
  }

  const control = findDropdownControl(field);
  if (!control) {
    return { attempted: false, selected: false };
  }

  const aliases = optionAliases(field, value, product);
  const clickedOptionTexts = new Set<string>();
  const maxSelections = field === "category" ? 3 : 1;

  for (const delay of [75, 150, 300]) {
    dispatchTrustedLikeClick(control);
    await new Promise<void>((resolve) => setTimeout(resolve, delay));

    for (let selectionIndex = 0; selectionIndex < maxSelections; selectionIndex += 1) {
      const option =
        findOption(aliases, clickedOptionTexts) ??
        (field === "category" ? await searchDropdownOptions(aliases, clickedOptionTexts) : null);
      if (!option) {
        break;
      }

      clickedOptionTexts.add(normalize(option.textContent));
      option.scrollIntoView?.({ block: "center", inline: "nearest" });
      dispatchTrustedLikeClick(option);
      await waitForUiUpdate();

      if (includesMatcher(dropdownText(control), aliases)) {
        return { attempted: true, selected: true };
      }
    }
  }

  return { attempted: true, selected: false };
};

const setNativeValue = (element: FillableElement, value: string) => {
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
    element.focus();
    document.execCommand?.("selectAll", false);
    const inserted = document.execCommand?.("insertText", false, value);
    if (!inserted || !(element.textContent ?? "").includes(value.slice(0, 20))) {
      element.textContent = value;
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const fieldValues = (product: MarketplaceProduct): Record<string, string> => ({
  title: product.title,
  price: String(product.price),
  description: [
    product.description,
    product.material ? `Material: ${product.material}` : "",
    product.color ? `Color: ${product.color}` : "",
    product.dimensions ? `Dimensions: ${product.dimensions}` : "",
    product.printTime ? `Print time: ${product.printTime}` : "",
    product.customization ? `Customization: ${product.customization}` : ""
  ]
    .filter(Boolean)
    .join("\n"),
  location: product.location
});

const dropdownValues = (product: MarketplaceProduct): Record<string, string> => ({
  category: product.category,
  condition: product.condition
});

const imageInput = (): HTMLInputElement | null => document.querySelector('input[type="file"]');

const revealImageInput = async (): Promise<HTMLInputElement | null> => {
  const existingInput = imageInput();
  if (existingInput) {
    return existingInput;
  }

  const controls = Array.from(document.querySelectorAll("button, [role='button'], label, [aria-label]"));
  const uploadControl = controls.find((element) => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      return false;
    }

    const text = [
      element.textContent ?? "",
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("title") ?? "",
      referencedText(element)
    ].join(" ");

    return includesMatcher(text, imageUploadMatchers);
  });

  if (uploadControl instanceof HTMLElement) {
    dispatchTrustedLikeClick(uploadControl);
    await waitForUiUpdate();
  }

  return imageInput();
};

const attachImages = async (product: MarketplaceProduct, fetchImage?: typeof fetch): Promise<number> => {
  const input = await revealImageInput();
  if (!input || !fetchImage || product.images.length === 0) {
    return 0;
  }

  if (typeof DataTransfer === "undefined") {
    return 0;
  }

  const transfer = new DataTransfer();

  for (const image of product.images) {
    try {
      const response = await fetchImage(image.url);
      if (!response.ok) {
        continue;
      }

      const blob = await response.blob();
      transfer.items.add(new File([blob], image.name, { type: blob.type || "image/jpeg" }));
    } catch {
      continue;
    }
  }

  if (transfer.files.length === 0) {
    return 0;
  }

  try {
    input.files = transfer.files;
  } catch {
    return 0;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return transfer.files.length;
};

const publishMarketplaceDraft = async (): Promise<boolean> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publishButton = findActionButton(publishMatchers);
    if (publishButton) {
      dispatchTrustedLikeClick(publishButton);
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      return true;
    }

    const nextButton = findActionButton(nextStepMatchers);
    if (!nextButton) {
      break;
    }

    dispatchTrustedLikeClick(nextButton);
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
  }

  const publishButton = findActionButton(publishMatchers);
  if (!publishButton) {
    return false;
  }

  dispatchTrustedLikeClick(publishButton);
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  return true;
};

export const fillMarketplaceDraft = async (product: MarketplaceProduct, options: FillOptions = {}): Promise<DraftResult> => {
  const filledFields: string[] = [];
  const missingFields: string[] = [];
  const values = fieldValues(product);

  for (const [field, value] of Object.entries(values)) {
    if (field === "location" && !value.trim()) {
      continue;
    }

    const element = await findFieldAfterReveal(field);
    if (!element) {
      missingFields.push(field);
      continue;
    }

    setNativeValue(element, value);
    filledFields.push(field);
  }

  for (const [field, value] of Object.entries(dropdownValues(product))) {
    if (!value.trim()) {
      continue;
    }

    const selected = await selectDropdownValue(field, value, product);
    if (selected.attempted && !selected.selected) {
      missingFields.push(field);
      continue;
    }

    if (selected.selected) {
      filledFields.push(field);
    }
  }

  const imageCount = await attachImages(product, options.fetchImage);
  if (options.fetchImage && product.images.length > 0 && imageCount === 0) {
    missingFields.push("images");
  }

  let published = false;
  if (options.publish && missingFields.length === 0) {
    published = await publishMarketplaceDraft();
    if (!published) {
      missingFields.push("publish");
    }
  }

  return {
    filledFields,
    missingFields,
    imageCount,
    published
  };
};
