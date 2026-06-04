import type { MarketplaceProduct } from "../domain/marketplaceProduct";

export type DraftResult = {
  filledFields: string[];
  missingFields: string[];
  imageCount: number;
  published: boolean;
  imageDebug: string[];
};

type FillOptions = {
  fetchImage?: typeof fetch;
  publish?: boolean;
  stepDelayMs?: number;
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
const nonFinalPublishMatchers = [
  "publicly",
  "more places",
  "groups",
  "marketplace",
  "\u05d1\u05d0\u05d5\u05e4\u05df \u05e6\u05d9\u05d1\u05d5\u05e8\u05d9",
  "\u05d1\u05e7\u05d1\u05d5\u05e6\u05d5\u05ea",
  "\u05d1\u05de\u05e7\u05d5\u05de\u05d5\u05ea \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd"
];

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
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const pace = async (milliseconds = 0): Promise<void> => {
  const delay = Math.max(0, Math.min(10000, Math.round(milliseconds)));
  if (delay > 0) {
    await wait(delay);
  }
};

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

const waitForDraftSurface = async (): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (findField("title") || findField("price") || findDropdownControl("category")) {
      return;
    }

    await wait(150);
  }
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

const actionButtonSignals = (element: Element): string[] =>
  [
    element.textContent ?? "",
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("value") ?? "",
    referencedText(element)
  ]
    .map((value) => normalize(value))
    .filter(Boolean);

type ActionButtonOptions = {
  exactOnly?: boolean;
  excludeMatchers?: string[];
  maxSignalLength?: number;
};

const findActionButton = (matchers: string[], options: ActionButtonOptions = {}): HTMLElement | null => {
  const candidates = Array.from(
    document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']")
  );
  const matchingButtons = candidates.filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element) || isDisabledElement(element)) {
      return false;
    }

    const signals = actionButtonSignals(element);
    if (signals.length === 0) {
      return false;
    }

    if (options.excludeMatchers?.length && signals.some((signal) => includesMatcher(signal, options.excludeMatchers ?? []))) {
      return false;
    }

    if (options.maxSignalLength && signals.every((signal) => signal.length > options.maxSignalLength!)) {
      return false;
    }

    if (options.exactOnly) {
      return signals.some((signal) => optionTextMatchesExactly(signal, matchers));
    }

    return signals.some((signal) => optionTextMatchesLoosely(signal, matchers));
  });

  if (matchingButtons.length === 0) {
    return null;
  }

  matchingButtons.sort((left, right) => {
    const leftSignals = actionButtonSignals(left);
    const rightSignals = actionButtonSignals(right);
    const leftExact = leftSignals.some((signal) => optionTextMatchesExactly(signal, matchers)) ? 0 : 1;
    const rightExact = rightSignals.some((signal) => optionTextMatchesExactly(signal, matchers)) ? 0 : 1;
    if (leftExact !== rightExact) {
      return leftExact - rightExact;
    }

    const leftLength = Math.min(...leftSignals.map((signal) => signal.length));
    const rightLength = Math.min(...rightSignals.map((signal) => signal.length));
    return leftLength - rightLength;
  });

  return matchingButtons[0] ?? null;
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

const optionPriority = (element: HTMLElement): number => {
  if (element.matches("[role='option'], [role='menuitem'], [role='radio'], [aria-selected]")) {
    return 0;
  }

  if (optionClickTarget(element) !== element) {
    return 1;
  }

  return 2;
};

const findOption = (aliases: string[], excludedTexts: Set<string> = new Set()): HTMLElement | null => {
  const options = Array.from(document.querySelectorAll(optionSelector));
  const visibleOptions = options
    .filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
        return false;
      }

      return !excludedTexts.has(normalize(element.textContent));
    })
    .sort((left, right) => {
      const priorityDelta = optionPriority(left) - optionPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return normalize(left.textContent).length - normalize(right.textContent).length;
    });

  const exactOption = visibleOptions.find((element) => optionTextMatchesExactly(element.textContent, aliases));
  if (exactOption) {
    return optionClickTarget(exactOption);
  }

  const looseOption = visibleOptions.find((element) => optionTextMatchesLoosely(element.textContent, aliases));
  return looseOption ? optionClickTarget(looseOption) : null;
};

const dropdownSelectionApplied = (control: HTMLElement, aliases: string[], initialText: string): boolean => {
  const currentText = normalize(dropdownText(control));
  if (currentText === initialText) {
    return false;
  }

  if (!includesMatcher(currentText, aliases)) {
    return false;
  }

  return control.getAttribute("aria-expanded") !== "true";
};

const selectDropdownValue = async (field: string, value: string, product?: MarketplaceProduct): Promise<DropdownSelection> => {
  if (!value.trim()) {
    return { attempted: false, selected: true };
  }

  const control = findDropdownControl(field);
  if (!control) {
    return { attempted: false, selected: false };
  }

  const aliases = optionAliases(field, value, product);
  const initialControlText = normalize(dropdownText(control));
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

      if (dropdownSelectionApplied(control, aliases, initialControlText)) {
        return { attempted: true, selected: true };
      }
    }
  }

  return { attempted: true, selected: false };
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

let imageDebug: string[] = [];

const addImageDebug = (message: string) => {
  imageDebug.push(message);
};

const supportedUploadMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensionToMimeType: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const mimeTypeToExtension: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const sanitizeFileName = (value: string): string => value.replace(/[\\/:*?"<>|]+/g, "-").trim();

const fileExtension = (value: string): string => {
  const match = value.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);
  return normalize(match?.[1] ?? "");
};

const inferMimeType = (name: string, url: string, fallbackMimeType: string): string => {
  const normalizedMimeType = normalize(fallbackMimeType);
  if (supportedUploadMimeTypes.has(normalizedMimeType)) {
    return normalizedMimeType;
  }

  const extension = fileExtension(name) || fileExtension(url);
  return extensionToMimeType[extension] ?? normalizedMimeType;
};

const isPotentiallySupportedImage = (name: string, url: string): boolean => {
  const extension = fileExtension(name) || fileExtension(url);
  if (!extension) {
    return true;
  }

  return supportedUploadMimeTypes.has(extensionToMimeType[extension] ?? "");
};

const normalizedUploadName = (name: string, url: string, mimeType: string, index: number): string => {
  const safeBaseName = sanitizeFileName(name) || sanitizeFileName(url.split("/").pop() ?? "") || `image-${index + 1}`;
  if (fileExtension(safeBaseName)) {
    return safeBaseName;
  }

  const extension = mimeTypeToExtension[mimeType];
  return extension ? `${safeBaseName}.${extension}` : safeBaseName;
};

const imageInputs = (): HTMLInputElement[] => Array.from(document.querySelectorAll('input[type="file"]'));

const describeImageInput = (input: HTMLInputElement): string =>
  `accept=${input.getAttribute("accept") ?? ""}; multiple=${input.multiple}; name=${input.name || ""}`;

const imageInput = (): HTMLInputElement | null => {
  const inputs = imageInputs();
  addImageDebug(`file inputs found: ${inputs.length}`);

  const preferredInputs = inputs.filter((input) => {
    const accept = normalize(input.getAttribute("accept"));
    const name = normalize(input.getAttribute("name"));
    const label = normalize(input.getAttribute("aria-label"));
    return input.multiple || accept.includes("image") || name.includes("photo") || name.includes("image") || label.includes("photo") || label.includes("image");
  });
  const chosenInput = preferredInputs[preferredInputs.length - 1] ?? inputs[inputs.length - 1] ?? null;
  if (chosenInput) {
    addImageDebug(`chosen input: ${describeImageInput(chosenInput)}`);
  }

  return chosenInput;
};

const findUploadControls = (): HTMLElement[] =>
  Array.from(document.querySelectorAll("button, [role='button'], label, [aria-label]")).filter((element): element is HTMLElement => {
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

const revealImageInput = async (): Promise<HTMLInputElement | null> => {
  const existingInput = imageInput();
  if (existingInput) {
    return existingInput;
  }

  const uploadControls = findUploadControls();
  addImageDebug(`upload controls found: ${uploadControls.length}`);
  for (const uploadControl of uploadControls) {
    addImageDebug(`click upload control: ${(uploadControl.textContent ?? uploadControl.getAttribute("aria-label") ?? "").trim().slice(0, 40)}`);
    dispatchTrustedLikeClick(uploadControl);

    for (const delay of [75, 150, 300, 600, 1000]) {
      await wait(delay);
      const revealedInput = imageInput();
      if (revealedInput) {
        return revealedInput;
      }
    }
  }

  return imageInput();
};

const uploadCountText = (): string => {
  const body = document.body;
  return body.innerText || body.textContent || "";
};

const readUploadedImageCount = (): number | null => {
  const counts = Array.from(uploadCountText().matchAll(/(\d+)\s*\/\s*(\d+)/g))
    .map((match) => ({ current: Number(match[1]), total: Number(match[2]) }))
    .filter((match) => Number.isFinite(match.current) && Number.isFinite(match.total) && match.total >= 2 && match.total <= 20);

  if (counts.length === 0) {
    return null;
  }

  return Math.max(...counts.map((match) => match.current));
};

const waitForImageAcceptance = async (expectedCount: number): Promise<void> => {
  const initialCount = readUploadedImageCount();
  addImageDebug(`initial FB image counter: ${initialCount ?? "not found"}`);
  if (initialCount === null) {
    await wait(2500);
    return;
  }

  for (const delay of [250, 250, 500, 500, 1000, 1000, 1500, 2000, 2500, 3000]) {
    await wait(delay);

    const nextCount = readUploadedImageCount();
    addImageDebug(`FB image counter after wait: ${nextCount ?? "not found"}`);
    if (nextCount !== null && nextCount >= expectedCount) {
      return;
    }
  }
};

const attachImages = async (product: MarketplaceProduct, fetchImage?: typeof fetch): Promise<number> => {
  imageDebug = [];
  addImageDebug(`product images: ${product.images.length}`);

  const input = await revealImageInput();
  if (!input || !fetchImage || product.images.length === 0) {
    addImageDebug(`blocked before download: input=${Boolean(input)}, fetch=${Boolean(fetchImage)}, images=${product.images.length}`);
    return 0;
  }

  if (typeof DataTransfer === "undefined") {
    addImageDebug("DataTransfer is unavailable.");
    return 0;
  }

  const transfer = new DataTransfer();
  const candidateImages = product.images
    .filter((image) => isPotentiallySupportedImage(image.name, image.url))
    .slice(0, 10);
  addImageDebug(`candidate images after filter: ${candidateImages.length}`);

  for (const [index, image] of candidateImages.entries()) {
    try {
      addImageDebug(`download ${index + 1}: ${image.url.slice(0, 90)}`);
      const response = await fetchImage(image.url);
      if (!response.ok) {
        addImageDebug(`download failed ${index + 1}: ${response.status}`);
        continue;
      }

      const blob = await response.blob();
      const mimeType = inferMimeType(image.name, image.url, blob.type || response.headers.get("content-type") || "");
      if (!supportedUploadMimeTypes.has(mimeType)) {
        addImageDebug(`unsupported mime ${index + 1}: ${mimeType || "unknown"}`);
        continue;
      }

      const fileName = normalizedUploadName(image.name, image.url, mimeType, index);
      transfer.items.add(new File([blob], fileName, { type: mimeType }));
      addImageDebug(`added file ${index + 1}: ${fileName}; ${mimeType}; ${blob.size} bytes`);
    } catch {
      addImageDebug(`download threw ${index + 1}`);
      continue;
    }
  }

  addImageDebug(`transfer files: ${transfer.files.length}`);
  if (transfer.files.length === 0) {
    return 0;
  }

  try {
    input.files = transfer.files;
  } catch {
    addImageDebug("setting input.files failed.");
    return 0;
  }

  addImageDebug(`input.files after set: ${input.files?.length ?? 0}`);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await waitForUiUpdate();
  await waitForImageAcceptance(transfer.files.length);
  return transfer.files.length;
};

const waitForActionButton = async (matchers: string[], timeoutMs: number): Promise<HTMLElement | null> => {
  const actionCandidates = document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']");
  if (actionCandidates.length === 0) {
    return null;
  }

  const startedAt = Date.now();

  do {
    const button = findActionButton(matchers);
    if (button) {
      return button;
    }

    await wait(500);
  } while (Date.now() - startedAt < timeoutMs);

  return null;
};

const findPublishButton = (): HTMLElement | null =>
  findActionButton(publishMatchers, {
    exactOnly: true,
    excludeMatchers: nonFinalPublishMatchers,
    maxSignalLength: 24
  }) ??
  findActionButton(publishMatchers, {
    excludeMatchers: nonFinalPublishMatchers,
    maxSignalLength: 16
  });

const waitForPublishButton = async (timeoutMs: number): Promise<HTMLElement | null> => {
  const actionCandidates = document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']");
  if (actionCandidates.length === 0) {
    return null;
  }

  const startedAt = Date.now();

  do {
    const button = findPublishButton();
    if (button) {
      return button;
    }

    await wait(500);
  } while (Date.now() - startedAt < timeoutMs);

  return null;
};

const publishMarketplaceDraft = async (stepDelayMs = 0): Promise<boolean> => {
  const nextButton =
    findActionButton(nextStepMatchers, { exactOnly: true, maxSignalLength: 16 }) ??
    (findPublishButton() ? null : await waitForActionButton(nextStepMatchers, 30000));
  if (nextButton) {
    await pace(stepDelayMs);
    dispatchTrustedLikeClick(nextButton);
    await wait(1200);

    const publishButton = await waitForPublishButton(45000);
    if (publishButton) {
      await pace(stepDelayMs);
      dispatchTrustedLikeClick(publishButton);
      await wait(1000);
      return true;
    }

    return false;
  }

  const publishButton = findPublishButton() ?? (await waitForPublishButton(10000));
  if (!publishButton) {
    return false;
  }

  await pace(stepDelayMs);
  dispatchTrustedLikeClick(publishButton);
  await wait(1000);
  return true;
};

export const fillMarketplaceDraft = async (product: MarketplaceProduct, options: FillOptions = {}): Promise<DraftResult> => {
  imageDebug = [];
  await waitForDraftSurface();
  const stepDelayMs = options.stepDelayMs ?? 0;

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
    await pace(stepDelayMs);
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
      await pace(stepDelayMs);
    }
  }

  await pace(stepDelayMs);
  const imageCount = await attachImages(product, options.fetchImage);
  if (options.fetchImage && product.images.length > 0 && imageCount === 0) {
    missingFields.push("images");
  }

  let published = false;
  if (options.publish && missingFields.length === 0) {
    published = await publishMarketplaceDraft(stepDelayMs);
    if (!published) {
      missingFields.push("publish");
    }
  }

  return {
    filledFields,
    missingFields,
    imageCount,
    published,
    imageDebug
  };
};
