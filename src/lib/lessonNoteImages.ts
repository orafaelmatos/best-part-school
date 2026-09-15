export type LessonNoteImageFit = "contain" | "cover";

export type LessonNoteImageValue = {
  src: string;
  alt?: string;
  fit: LessonNoteImageFit;
  zoom: number;
  positionX: number;
  positionY: number;
  height: number;
};

export const LESSON_NOTE_IMAGE_CLASS = "bps-note-image";
export const LESSON_NOTE_IMAGE_SELECTOR = "[data-bps-note-image='true'], figure.bps-note-image";
export const LESSON_NOTE_IMAGE_ACTIVE_ATTR = "data-bps-note-image-active";

const DATA_FIT = "data-bps-note-image-fit";
const DATA_ZOOM = "data-bps-note-image-zoom";
const DATA_POSITION_X = "data-bps-note-image-x";
const DATA_POSITION_Y = "data-bps-note-image-y";
const DATA_HEIGHT = "data-bps-note-image-height";

export const LESSON_NOTE_IMAGE_DEFAULTS: Omit<LessonNoteImageValue, "src" | "alt"> = {
  fit: "contain",
  zoom: 100,
  positionX: 50,
  positionY: 50,
  height: 260,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const numberFromAttribute = (value: string | null | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeFit = (value: string | null | undefined): LessonNoteImageFit =>
  value === "cover" ? "cover" : "contain";

export const normalizeLessonNoteImageValue = (
  value: Partial<LessonNoteImageValue> & { src: string },
): LessonNoteImageValue => ({
  src: value.src,
  alt: value.alt || "Imagem da aula",
  fit: normalizeFit(value.fit),
  zoom: clamp(Math.round(value.zoom ?? LESSON_NOTE_IMAGE_DEFAULTS.zoom), 100, 300),
  positionX: clamp(Math.round(value.positionX ?? LESSON_NOTE_IMAGE_DEFAULTS.positionX), 0, 100),
  positionY: clamp(Math.round(value.positionY ?? LESSON_NOTE_IMAGE_DEFAULTS.positionY), 0, 100),
  height: clamp(Math.round(value.height ?? LESSON_NOTE_IMAGE_DEFAULTS.height), 140, 560),
});

export const buildLessonNoteImageValue = (src: string, alt?: string): LessonNoteImageValue =>
  normalizeLessonNoteImageValue({ src, alt });

export const buildLessonNoteImageStyle = (value: LessonNoteImageValue) => {
  const normalized = normalizeLessonNoteImageValue(value);
  return [
    `--bps-note-image-fit: ${normalized.fit}`,
    `--bps-note-image-zoom: ${(normalized.zoom / 100).toFixed(2)}`,
    `--bps-note-image-position-x: ${normalized.positionX}%`,
    `--bps-note-image-position-y: ${normalized.positionY}%`,
    `--bps-note-image-height: ${normalized.height}px`,
  ].join("; ");
};

const imageForElement = (element: Element) =>
  element instanceof HTMLImageElement
    ? element
    : element.querySelector("img");

export const readLessonNoteImageValue = (element: Element): LessonNoteImageValue => {
  const container = element.closest?.(LESSON_NOTE_IMAGE_SELECTOR) || element;
  const image = imageForElement(container);
  const src = image?.getAttribute("src") || "";
  const style = container instanceof HTMLElement ? container.style : undefined;

  return normalizeLessonNoteImageValue({
    src,
    alt: image?.getAttribute("alt") || undefined,
    fit: normalizeFit(container.getAttribute(DATA_FIT) || style?.getPropertyValue("--bps-note-image-fit")),
    zoom: numberFromAttribute(
      container.getAttribute(DATA_ZOOM),
      numberFromAttribute(style?.getPropertyValue("--bps-note-image-zoom"), 1) * 100,
    ),
    positionX: numberFromAttribute(
      container.getAttribute(DATA_POSITION_X),
      numberFromAttribute(style?.getPropertyValue("--bps-note-image-position-x")?.replace("%", ""), 50),
    ),
    positionY: numberFromAttribute(
      container.getAttribute(DATA_POSITION_Y),
      numberFromAttribute(style?.getPropertyValue("--bps-note-image-position-y")?.replace("%", ""), 50),
    ),
    height: numberFromAttribute(
      container.getAttribute(DATA_HEIGHT),
      numberFromAttribute(style?.getPropertyValue("--bps-note-image-height")?.replace("px", ""), 260),
    ),
  });
};

export const applyLessonNoteImageValue = (
  element: HTMLElement,
  value: Partial<LessonNoteImageValue> & { src: string },
) => {
  const normalized = normalizeLessonNoteImageValue(value);
  const container = (element.closest(LESSON_NOTE_IMAGE_SELECTOR) || element) as HTMLElement;
  const image = imageForElement(container);

  container.classList.add(LESSON_NOTE_IMAGE_CLASS);
  container.setAttribute("data-bps-note-image", "true");
  container.setAttribute("contenteditable", "false");
  container.setAttribute(DATA_FIT, normalized.fit);
  container.setAttribute(DATA_ZOOM, String(normalized.zoom));
  container.setAttribute(DATA_POSITION_X, String(normalized.positionX));
  container.setAttribute(DATA_POSITION_Y, String(normalized.positionY));
  container.setAttribute(DATA_HEIGHT, String(normalized.height));
  container.setAttribute("style", buildLessonNoteImageStyle(normalized));

  if (image) {
    image.setAttribute("src", normalized.src);
    image.setAttribute("alt", normalized.alt || "Imagem da aula");
    image.setAttribute("draggable", "false");
    image.removeAttribute("width");
    image.removeAttribute("height");
    if (image !== container) {
      image.removeAttribute("style");
    }
  }

  return normalized;
};

export const createLessonNoteImageElement = (
  value: Partial<LessonNoteImageValue> & { src: string },
  ownerDocument: Document = document,
) => {
  const normalized = normalizeLessonNoteImageValue(value);
  const figure = ownerDocument.createElement("figure");
  const image = ownerDocument.createElement("img");

  figure.appendChild(image);
  applyLessonNoteImageValue(figure, normalized);
  return figure;
};

const isWhitespaceNode = (node: ChildNode) =>
  node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();

const isOnlyMeaningfulChild = (parent: Element, child: Element) =>
  Array.from(parent.childNodes).every((node) => node === child || isWhitespaceNode(node));

export const normalizeLessonNoteImagesHtml = (html: string) => {
  if (!html || typeof document === "undefined" || typeof Node === "undefined") {
    return html || "";
  }

  const root = document.createElement("div");
  root.innerHTML = html;

  root.querySelectorAll(LESSON_NOTE_IMAGE_SELECTOR).forEach((container) => {
    const image = imageForElement(container);
    if (!image?.getAttribute("src")) return;
    applyLessonNoteImageValue(container as HTMLElement, readLessonNoteImageValue(container));
  });

  root.querySelectorAll("img").forEach((image) => {
    if (image.closest(LESSON_NOTE_IMAGE_SELECTOR)) {
      return;
    }

    const figure = createLessonNoteImageElement({
      src: image.getAttribute("src") || "",
      alt: image.getAttribute("alt") || undefined,
      fit: normalizeFit(image.getAttribute(DATA_FIT) || image.style.objectFit),
      zoom: numberFromAttribute(image.getAttribute(DATA_ZOOM), 100),
      positionX: numberFromAttribute(image.getAttribute(DATA_POSITION_X), 50),
      positionY: numberFromAttribute(image.getAttribute(DATA_POSITION_Y), 50),
      height: numberFromAttribute(image.getAttribute(DATA_HEIGHT) || image.getAttribute("height"), 260),
    });
    const parent = image.parentElement;

    if (parent?.tagName.toLowerCase() === "p" && isOnlyMeaningfulChild(parent, image)) {
      parent.replaceWith(figure);
      return;
    }

    image.replaceWith(figure);
  });

  return stripLessonNoteImageTransientState(root.innerHTML);
};

export const stripLessonNoteImageTransientState = (html: string) =>
  html
    .replace(new RegExp(`\\s${LESSON_NOTE_IMAGE_ACTIVE_ATTR}(=("true"|''|""))?`, "g"), "")
    .replace(/\sdata-bps-note-image-active='true'/g, "");

export const serializeLessonNoteEditorHtml = (root: HTMLElement) => {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[${LESSON_NOTE_IMAGE_ACTIVE_ATTR}]`).forEach((element) => {
    element.removeAttribute(LESSON_NOTE_IMAGE_ACTIVE_ATTR);
  });
  clone.querySelectorAll(LESSON_NOTE_IMAGE_SELECTOR).forEach((container) => {
    const image = imageForElement(container);
    if (!image?.getAttribute("src")) return;
    applyLessonNoteImageValue(container as HTMLElement, readLessonNoteImageValue(container));
  });
  return clone.innerHTML;
};

export const findLessonNoteImageElement = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest(LESSON_NOTE_IMAGE_SELECTOR) as HTMLElement | null;
};
