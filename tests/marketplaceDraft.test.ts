import { fillMarketplaceDraft } from "../src/marketplace/marketplaceDraft";
import type { MarketplaceProduct } from "../src/domain/marketplaceProduct";

const he = {
  title: "\u05db\u05d5\u05ea\u05e8\u05ea",
  price: "\u05de\u05d7\u05d9\u05e8",
  description: "\u05ea\u05d9\u05d0\u05d5\u05e8",
  location: "\u05de\u05d9\u05e7\u05d5\u05dd",
  category: "\u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4",
  condition: "\u05de\u05e6\u05d1",
  new: "\u05d7\u05d3\u05e9",
  homeDecor: "\u05e2\u05d9\u05e6\u05d5\u05d1 \u05d4\u05d1\u05d9\u05ea",
  additionalDetails: "\u05e4\u05e8\u05d8\u05d9\u05dd \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd \u05d9\u05db\u05d5\u05dc\u05d9\u05dd \u05dc\u05e2\u05d6\u05d5\u05e8 \u05dc\u05de\u05e9\u05d5\u05da \u05d9\u05d5\u05ea\u05e8 \u05ea\u05e9\u05d5\u05de\u05ea \u05dc\u05d1 \u05dc\u05de\u05d5\u05d3\u05e2\u05d4.",
  addPhotos: "\u05d4\u05d5\u05e1\u05e3 \u05ea\u05de\u05d5\u05e0\u05d5\u05ea"
};

const product: MarketplaceProduct = {
  id: "page-1",
  status: "Ready",
  title: "Dragon phone stand",
  description: "3D printed PLA stand, strong and clean finish.",
  price: 49,
  currency: "ILS",
  category: "Home goods",
  condition: "New",
  location: "Tel Aviv",
  images: [{ url: "https://example.com/dragon.jpg", name: "dragon.jpg" }],
  sku: "DRAGON-1",
  material: "PLA",
  color: "Black",
  variantGroup: "dragon-stand"
};

describe("fillMarketplaceDraft", () => {
  it("fills known marketplace fields and never publishes", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <button aria-label="Publish">Publish</button>
    `;

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined });

    expect((document.querySelector('input[name="title"]') as HTMLInputElement).value).toBe("Dragon phone stand");
    expect((document.querySelector('input[name="price"]') as HTMLInputElement).value).toBe("49");
    expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toContain("3D printed PLA stand");
    expect(result.published).toBe(false);
    expect(result.missingFields).toEqual([]);
  });

  it("returns missing fields instead of throwing when Facebook changes markup", async () => {
    document.body.innerHTML = `<label>Title<input /></label>`;

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined });

    expect(result.published).toBe(false);
    expect(result.missingFields).toEqual(["price", "description", "location"]);
  });

  it("keeps the draft fill working when image downloads fail", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <input type="file" />
    `;
    vi.stubGlobal(
      "DataTransfer",
      class {
        files = { length: 0 };
        items = { add: vi.fn() };
      }
    );

    const result = await fillMarketplaceDraft(product, {
      fetchImage: vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    });

    expect((document.querySelector('input[name="title"]') as HTMLInputElement).value).toBe("Dragon phone stand");
    expect(result.imageCount).toBe(0);
    expect(result.missingFields).toContain("images");
    expect(result.published).toBe(false);
  });

  it("reveals Facebook photo input before attaching images", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <button type="button">${he.addPhotos}</button>
    `;
    const file = new File([new Blob(["image"], { type: "image/jpeg" })], "dragon.jpg", { type: "image/jpeg" });

    vi.stubGlobal(
      "DataTransfer",
      class {
        files: File[] = [];
        items = {
          add: vi.fn((addedFile: File) => {
            this.files.push(addedFile);
          })
        };
      }
    );

    document.querySelector("button")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      Object.defineProperty(input, "files", { value: [], writable: true });
      document.body.append(input);
    });

    const result = await fillMarketplaceDraft(product, {
      fetchImage: vi.fn().mockResolvedValue(new Response(file))
    });

    expect(result.imageCount).toBe(1);
    expect(result.missingFields).toEqual([]);
  });

  it("waits for a delayed photo input before attaching images", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <button type="button">${he.addPhotos}</button>
    `;
    const file = new File([new Blob(["image"], { type: "image/jpeg" })], "dragon.jpg", { type: "image/jpeg" });

    vi.stubGlobal(
      "DataTransfer",
      class {
        files: File[] = [];
        items = {
          add: vi.fn((addedFile: File) => {
            this.files.push(addedFile);
          })
        };
      }
    );

    document.querySelector("button")?.addEventListener("click", () => {
      setTimeout(() => {
        const input = document.createElement("input");
        input.type = "file";
        Object.defineProperty(input, "files", { value: [], writable: true });
        document.body.append(input);
      }, 250);
    });

    const result = await fillMarketplaceDraft(product, {
      fetchImage: vi.fn().mockResolvedValue(new Response(file))
    });

    expect(result.imageCount).toBe(1);
    expect(result.missingFields).toEqual([]);
  });

  it("normalizes MakerWorld image metadata before attaching files", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <input type="file" />
    `;

    const addedFiles: File[] = [];
    vi.stubGlobal(
      "DataTransfer",
      class {
        files: File[] = addedFiles;
        items = {
          add: vi.fn((addedFile: File) => {
            addedFiles.push(addedFile);
          })
        };
      }
    );
    Object.defineProperty(document.querySelector('input[type="file"]') as HTMLInputElement, "files", {
      value: [],
      writable: true
    });

    const result = await fillMarketplaceDraft(
      {
        ...product,
        images: [
          {
            url: "https://makerworld.bblmw.com/makerworld/model/example/design/sample-photo.jpg",
            name: "MakerWorld Image 1"
          }
        ]
      },
      {
        fetchImage: vi.fn().mockResolvedValue(
          new Response(new Blob(["image-bytes"]), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" }
          })
        )
      }
    );

    expect(addedFiles).toHaveLength(1);
    expect(addedFiles[0]?.name).toBe("MakerWorld Image 1.jpg");
    expect(addedFiles[0]?.type).toBe("image/jpeg");
    expect(result.imageCount).toBe(1);
  });

  it("skips unsupported gif files and still uploads supported images", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <input type="file" />
    `;

    const addedFiles: File[] = [];
    vi.stubGlobal(
      "DataTransfer",
      class {
        files: File[] = addedFiles;
        items = {
          add: vi.fn((addedFile: File) => {
            addedFiles.push(addedFile);
          })
        };
      }
    );
    Object.defineProperty(document.querySelector('input[type="file"]') as HTMLInputElement, "files", {
      value: [],
      writable: true
    });

    const fetchImage = vi.fn().mockResolvedValue(new Response(new Blob(["jpg-bytes"], { type: "image/jpeg" }), { status: 200 }));

    const result = await fillMarketplaceDraft(
      {
        ...product,
        images: [
          { url: "https://makerworld.bblmw.com/example/animated-preview.gif", name: "MakerWorld Image 1" },
          { url: "https://makerworld.bblmw.com/example/product-photo.jpg", name: "MakerWorld Image 2" }
        ]
      },
      {
        fetchImage
      }
    );

    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(fetchImage).toHaveBeenCalledWith("https://makerworld.bblmw.com/example/product-photo.jpg");
    expect(addedFiles).toHaveLength(1);
    expect(addedFiles[0]?.name).toBe("MakerWorld Image 2.jpg");
    expect(addedFiles[0]?.type).toBe("image/jpeg");
    expect(result.imageCount).toBe(1);
  });

  it("waits for Facebook to acknowledge uploaded images before publishing", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <div id="image-count">תמונות: 0 / 10</div>
      <input type="file" />
      <button type="button">פרסם</button>
    `;

    const addedFiles: File[] = [];
    vi.stubGlobal(
      "DataTransfer",
      class {
        files: File[] = addedFiles;
        items = {
          add: vi.fn((addedFile: File) => {
            addedFiles.push(addedFile);
          })
        };
      }
    );

    const uploadInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(uploadInput, "files", { value: [], writable: true });
    uploadInput.addEventListener("change", () => {
      setTimeout(() => {
        const counter = document.getElementById("image-count");
        if (counter) {
          counter.textContent = "תמונות: 1 / 10";
        }
        document.body.setAttribute("data-images-ready", "true");
      }, 350);
    });

    document.querySelector("button")?.addEventListener("click", () => {
      if (document.body.getAttribute("data-images-ready") === "true") {
        document.body.setAttribute("data-published", "true");
        return;
      }

      document.body.setAttribute("data-premature-publish", "true");
    });

    const result = await fillMarketplaceDraft(product, {
      fetchImage: vi.fn().mockResolvedValue(new Response(new Blob(["image"], { type: "image/jpeg" }), { status: 200 })),
      publish: true
    });

    expect(document.body.getAttribute("data-premature-publish")).not.toBe("true");
    expect(document.body.getAttribute("data-published")).toBe("true");
    expect(result.published).toBe(true);
  });

  it("waits for all accepted images before clicking next and publish", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <div id="image-count">תמונות: 0 / 10</div>
      <input type="file" />
      <button type="button">הבא</button>
    `;

    const addedFiles: File[] = [];
    vi.stubGlobal(
      "DataTransfer",
      class {
        files: File[] = addedFiles;
        items = {
          add: vi.fn((addedFile: File) => {
            addedFiles.push(addedFile);
          })
        };
      }
    );

    const uploadInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(uploadInput, "files", { value: [], writable: true });
    uploadInput.addEventListener("change", () => {
      setTimeout(() => {
        const counter = document.getElementById("image-count");
        if (counter) {
          counter.textContent = "תמונות: 1 / 10";
        }
      }, 150);

      setTimeout(() => {
        const counter = document.getElementById("image-count");
        if (counter) {
          counter.textContent = "תמונות: 3 / 10";
        }
        document.body.setAttribute("data-images-ready", "true");
      }, 450);
    });

    document.querySelector("button")?.addEventListener("click", () => {
      if (document.body.getAttribute("data-images-ready") !== "true") {
        document.body.setAttribute("data-premature-next", "true");
        return;
      }

      const publish = document.createElement("button");
      publish.type = "button";
      publish.textContent = "פרסם";
      publish.addEventListener("click", () => {
        document.body.setAttribute("data-published", "true");
      });
      document.body.append(publish);
    });

    const result = await fillMarketplaceDraft(
      {
        ...product,
        images: [
          { url: "https://example.com/one.jpg", name: "one.jpg" },
          { url: "https://example.com/two.jpg", name: "two.jpg" },
          { url: "https://example.com/three.jpg", name: "three.jpg" }
        ]
      },
      {
        fetchImage: vi.fn().mockResolvedValue(new Response(new Blob(["image"], { type: "image/jpeg" }), { status: 200 })),
        publish: true
      }
    );

    expect(document.body.getAttribute("data-premature-next")).not.toBe("true");
    expect(document.body.getAttribute("data-published")).toBe("true");
    expect(result.published).toBe(true);
  });

  it("fills Facebook-like aria and contenteditable fields", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div aria-label="Description" contenteditable="true"></div>
      <input aria-label="Location" />
    `;

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined });

    expect((document.querySelector('[aria-label="Title"]') as HTMLInputElement).value).toBe("Dragon phone stand");
    expect((document.querySelector('[aria-label="Price"]') as HTMLInputElement).value).toBe("49");
    expect((document.querySelector('[aria-label="Description"]') as HTMLElement).textContent).toContain(
      "3D printed PLA stand"
    );
    expect((document.querySelector('[aria-label="Location"]') as HTMLInputElement).value).toBe("Tel Aviv");
    expect(result.missingFields).toEqual([]);
  });

  it("fills Hebrew-labeled Facebook fields", async () => {
    document.body.innerHTML = `
      <input aria-label="${he.title}" />
      <input aria-label="${he.price}" />
      <div aria-label="${he.description}" contenteditable="true"></div>
    `;

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined });

    expect((document.querySelector(`[aria-label="${he.title}"]`) as HTMLInputElement).value).toBe(
      "Dragon phone stand"
    );
    expect((document.querySelector(`[aria-label="${he.price}"]`) as HTMLInputElement).value).toBe("49");
    expect((document.querySelector(`[aria-label="${he.description}"]`) as HTMLElement).textContent).toContain(
      "3D printed PLA stand"
    );
    expect(result.missingFields).toEqual(["location"]);
  });

  it("fills fields labelled through external aria references", async () => {
    document.body.innerHTML = `
      <span id="title-label">${he.title}</span><input aria-labelledby="title-label" />
      <span id="price-label">${he.price}</span><input aria-labelledby="price-label" />
      <span id="description-label">${he.description}</span><div role="textbox" aria-labelledby="description-label" contenteditable="true"></div>
      <span id="location-label">${he.location}</span><input role="combobox" aria-labelledby="location-label" />
    `;

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined });

    expect((document.querySelector('[aria-labelledby="title-label"]') as HTMLInputElement).value).toBe(
      "Dragon phone stand"
    );
    expect((document.querySelector('[aria-labelledby="price-label"]') as HTMLInputElement).value).toBe("49");
    expect((document.querySelector('[aria-labelledby="description-label"]') as HTMLElement).textContent).toContain(
      "3D printed PLA stand"
    );
    expect((document.querySelector('[aria-labelledby="location-label"]') as HTMLInputElement).value).toBe("Tel Aviv");
    expect(result.missingFields).toEqual([]);
  });

  it("does not report missing location when there is no location value to fill", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div aria-label="Description" contenteditable="true"></div>
    `;

    const result = await fillMarketplaceDraft({ ...product, location: "" }, { fetchImage: undefined });

    expect(result.missingFields).toEqual([]);
  });

  it("fills an unlabeled rich text editor as the description fallback", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div role="textbox" contenteditable="plaintext-only" data-lexical-editor="true"></div>
    `;

    const result = await fillMarketplaceDraft({ ...product, location: "" }, { fetchImage: undefined });

    expect((document.querySelector('[aria-label="Title"]') as HTMLInputElement).value).toBe("Dragon phone stand");
    expect((document.querySelector('[aria-label="Price"]') as HTMLInputElement).value).toBe("49");
    expect((document.querySelector("[data-lexical-editor]") as HTMLElement).textContent).toContain(
      "3D printed PLA stand"
    );
    expect(result.missingFields).toEqual([]);
  });

  it("expands Facebook additional details before filling description", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <button type="button" aria-expanded="false">${he.additionalDetails}</button>
    `;
    document.querySelector("button")?.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", `<div aria-label="${he.description}" contenteditable="true"></div>`);
    });

    const result = await fillMarketplaceDraft({ ...product, location: "" }, { fetchImage: undefined });

    expect((document.querySelector(`[aria-label="${he.description}"]`) as HTMLElement).textContent).toContain(
      "3D printed PLA stand"
    );
    expect(result.missingFields).toEqual([]);
  });

  it("selects category and condition from Facebook dropdown style controls", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div aria-label="Description" contenteditable="true"></div>
      <button type="button" aria-haspopup="listbox">${he.category}</button>
      <button type="button" aria-haspopup="listbox">${he.condition}</button>
    `;
    const buttons = Array.from(document.querySelectorAll("button"));
    buttons[0].addEventListener("click", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.homeDecor;
      option.addEventListener("click", () => {
        buttons[0].textContent = he.homeDecor;
      });
      document.body.append(option);
    });
    buttons[1].addEventListener("click", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.new;
      option.addEventListener("click", () => {
        buttons[1].textContent = he.new;
      });
      document.body.append(option);
    });

    const result = await fillMarketplaceDraft(
      { ...product, category: "Decor", condition: "New", location: "" },
      { fetchImage: undefined }
    );

    expect(buttons[0].textContent).toContain(he.homeDecor);
    expect(buttons[1].textContent).toContain(he.new);
    expect(result.missingFields).toEqual([]);
    expect(result.filledFields).toContain("category");
    expect(result.filledFields).toContain("condition");
  });

  it("reports dropdowns as missing when Facebook does not accept the selection", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div aria-label="Description" contenteditable="true"></div>
      <button type="button" aria-haspopup="listbox">${he.category}</button>
      <button type="button" aria-haspopup="listbox">${he.condition}</button>
    `;
    const buttons = Array.from(document.querySelectorAll("button"));
    buttons[0].addEventListener("click", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.homeDecor;
      document.body.append(option);
    });
    buttons[1].addEventListener("click", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.new;
      document.body.append(option);
    });

    const result = await fillMarketplaceDraft(
      { ...product, category: "Decor", condition: "New", location: "", images: [] },
      { fetchImage: undefined }
    );

    expect(result.missingFields).toEqual(["category", "condition"]);
    expect(result.filledFields).not.toContain("category");
    expect(result.filledFields).not.toContain("condition");
  });

  it("does not treat a non-clickable 'new' heading as a selected condition", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div aria-label="Description" contenteditable="true"></div>
      <button type="button" aria-haspopup="listbox">${he.category}</button>
      <button type="button" aria-haspopup="listbox" aria-expanded="false">${he.condition}</button>
    `;

    const buttons = Array.from(document.querySelectorAll("button"));
    buttons[0].addEventListener("click", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.homeDecor;
      option.addEventListener("click", () => {
        buttons[0].textContent = he.homeDecor;
      });
      document.body.append(option);
    });
    buttons[1].addEventListener("click", () => {
      buttons[1].setAttribute("aria-expanded", "true");

      const heading = document.createElement("div");
      heading.textContent = he.new;
      document.body.append(heading);

      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.new;
      option.addEventListener("click", () => {
        buttons[1].textContent = he.new;
        buttons[1].setAttribute("aria-expanded", "false");
      });
      document.body.append(option);
    });

    const result = await fillMarketplaceDraft(
      { ...product, category: "Decor", condition: "New", location: "", images: [] },
      { fetchImage: undefined }
    );

    expect(buttons[1].textContent).toContain(he.new);
    expect(result.missingFields).toEqual([]);
    expect(result.filledFields).toContain("condition");
  });

  it("searches the Facebook category menu when category options are not visible yet", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div aria-label="Description" contenteditable="true"></div>
      <button type="button" aria-haspopup="listbox">${he.category}</button>
      <button type="button" aria-haspopup="listbox">${he.condition}</button>
    `;
    const buttons = Array.from(document.querySelectorAll("button"));
    buttons[0].addEventListener("click", () => {
      if (document.querySelector('[aria-label="Search categories"]')) {
        return;
      }

      const search = document.createElement("input");
      search.setAttribute("aria-label", "Search categories");
      search.addEventListener("input", () => {
        const option = document.createElement("div");
        option.setAttribute("role", "option");
        option.textContent = he.homeDecor;
        option.addEventListener("click", () => {
          buttons[0].textContent = he.homeDecor;
        });
        document.body.append(option);
      });
      document.body.append(search);
    });
    buttons[1].addEventListener("click", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.new;
      option.addEventListener("click", () => {
        buttons[1].textContent = he.new;
      });
      document.body.append(option);
    });

    const result = await fillMarketplaceDraft(
      { ...product, category: "Decor", condition: "New", location: "", images: [] },
      { fetchImage: undefined }
    );

    expect(buttons[0].textContent).toContain(he.homeDecor);
    expect(result.missingFields).toEqual([]);
    expect(result.filledFields).toContain("category");
  });

  it("selects a nested Facebook category for planter listings", async () => {
    document.body.innerHTML = `
      <input aria-label="Title" />
      <input aria-label="Price" />
      <div aria-label="Description" contenteditable="true"></div>
      <button type="button" aria-haspopup="listbox">${he.category}</button>
      <button type="button" aria-haspopup="listbox">${he.condition}</button>
    `;
    const buttons = Array.from(document.querySelectorAll("button"));
    buttons[0].addEventListener("click", () => {
      const homeAndGarden = document.createElement("div");
      homeAndGarden.setAttribute("role", "option");
      homeAndGarden.textContent = "\u05d1\u05d9\u05ea \u05d5\u05d2\u05df";
      homeAndGarden.addEventListener("click", () => {
        homeAndGarden.remove();

        const garden = document.createElement("div");
        garden.setAttribute("role", "option");
        garden.textContent = "\u05d2\u05df";
        garden.addEventListener("click", () => {
          buttons[0].textContent = "\u05d2\u05df";
        });
        document.body.append(garden);
      });
      document.body.append(homeAndGarden);
    });
    buttons[1].addEventListener("click", () => {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = he.new;
      option.addEventListener("click", () => {
        buttons[1].textContent = he.new;
      });
      document.body.append(option);
    });

    const result = await fillMarketplaceDraft(
      {
        ...product,
        title: "adrift • planter",
        description: "3D printed planter for indoor plants.",
        category: "Decor",
        condition: "New",
        location: "",
        images: []
      },
      { fetchImage: undefined }
    );

    expect(buttons[0].textContent).toContain("\u05d2\u05df");
    expect(result.missingFields).toEqual([]);
    expect(result.filledFields).toContain("category");
  });

  it("publishes after filling when a next step and final publish button are available", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <button type="button">\u05d4\u05d1\u05d0</button>
    `;

    document.querySelector("button")?.addEventListener("click", () => {
      if (document.querySelector('[data-testid="publish-button"]')) {
        return;
      }

      const publish = document.createElement("button");
      publish.type = "button";
      publish.dataset.testid = "publish-button";
      publish.textContent = "\u05e4\u05e8\u05e1\u05dd";
      publish.addEventListener("click", () => {
        document.body.setAttribute("data-published", "true");
      });
      document.body.append(publish);
    });

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined, publish: true });

    expect(document.body.getAttribute("data-published")).toBe("true");
    expect(result.missingFields).toEqual([]);
    expect(result.published).toBe(true);
  });

  it("reports an unpublished result when auto publish cannot find a submit button", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
    `;

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined, publish: true });

    expect(result.published).toBe(false);
    expect(result.missingFields).toContain("publish");
  });

  it("waits for Facebook draft fields to appear before filling", async () => {
    document.body.innerHTML = `<div id="shell"></div>`;

    setTimeout(() => {
      document.body.innerHTML = `
        <label>Title<input name="title" /></label>
        <label>Price<input name="price" /></label>
        <label>Description<textarea name="description"></textarea></label>
        <label>Location<input name="location" /></label>
      `;
    }, 120);

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined });

    expect((document.querySelector('input[name="title"]') as HTMLInputElement).value).toBe("Dragon phone stand");
    expect(result.missingFields).toEqual([]);
  });

  it("waits for a delayed publish button after advancing to the next step", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <button type="button">\u05d4\u05d1\u05d0</button>
    `;

    document.querySelector("button")?.addEventListener("click", () => {
      setTimeout(() => {
        const publish = document.createElement("button");
        publish.type = "button";
        publish.textContent = "\u05e4\u05e8\u05e1\u05dd";
        publish.addEventListener("click", () => {
          document.body.setAttribute("data-published", "true");
        });
        document.body.append(publish);
      }, 700);
    });

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined, publish: true });

    expect(document.body.getAttribute("data-published")).toBe("true");
    expect(result.published).toBe(true);
  });

  it("clicks the final publish button instead of other publish-related controls on the extra-places step", async () => {
    document.body.innerHTML = `
      <label>Title<input name="title" /></label>
      <label>Price<input name="price" /></label>
      <label>Description<textarea name="description"></textarea></label>
      <label>Location<input name="location" /></label>
      <button type="button">\u05d4\u05d1\u05d0</button>
    `;

    document.querySelector("button")?.addEventListener("click", () => {
      const heading = document.createElement("div");
      heading.textContent = "\u05e4\u05e8\u05e1\u05d5\u05dd \u05d1\u05de\u05e7\u05d5\u05de\u05d5\u05ea \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd";
      document.body.append(heading);

      const publicOption = document.createElement("button");
      publicOption.type = "button";
      publicOption.textContent = "\u05e4\u05e8\u05e1\u05d5\u05dd \u05d1\u05d0\u05d5\u05e4\u05df \u05e6\u05d9\u05d1\u05d5\u05e8\u05d9";
      publicOption.addEventListener("click", () => {
        document.body.setAttribute("data-wrong-publish-clicked", "true");
      });
      document.body.append(publicOption);

      const back = document.createElement("button");
      back.type = "button";
      back.textContent = "\u05d4\u05e7\u05d5\u05d3\u05dd";
      document.body.append(back);

      const publish = document.createElement("button");
      publish.type = "button";
      publish.textContent = "\u05e4\u05e8\u05e1\u05d5\u05dd";
      publish.addEventListener("click", () => {
        document.body.setAttribute("data-published", "true");
      });
      document.body.append(publish);
    });

    const result = await fillMarketplaceDraft(product, { fetchImage: undefined, publish: true });

    expect(document.body.getAttribute("data-wrong-publish-clicked")).not.toBe("true");
    expect(document.body.getAttribute("data-published")).toBe("true");
    expect(result.published).toBe(true);
  });
});
