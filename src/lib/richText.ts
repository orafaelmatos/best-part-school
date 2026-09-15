import {
  LESSON_NOTE_IMAGE_CLASS,
  LESSON_NOTE_IMAGE_SELECTOR,
  applyLessonNoteImageValue,
  readLessonNoteImageValue,
} from "@/lib/lessonNoteImages";

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "em",
  "figure",
  "h1",
  "h2",
  "h3",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "s",
  "span",
  "strike",
  "strong",
  "u",
  "ul",
]);

const DROP_WITH_CONTENT_TAGS = new Set(["script", "style", "iframe", "object", "embed"]);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isSafeHref = (href: string) => {
  const trimmed = href.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const isSafeSrc = (src: string) => {
  const trimmed = src.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const unwrapElement = (element: Element) => {
  const fragment = document.createDocumentFragment();
  while (element.firstChild) {
    fragment.appendChild(element.firstChild);
  }
  element.replaceWith(fragment);
};

const sanitizeNode = (node: ChildNode) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.remove();
    return;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (DROP_WITH_CONTENT_TAGS.has(tagName)) {
    element.remove();
    return;
  }

  Array.from(element.childNodes).forEach(sanitizeNode);

  if (!ALLOWED_TAGS.has(tagName)) {
    unwrapElement(element);
    return;
  }

  const href = element.getAttribute("href") || "";
  const src = element.getAttribute("src") || "";
  const alt = element.getAttribute("alt") || "";
  const noteImageValue = element.matches(LESSON_NOTE_IMAGE_SELECTOR)
    ? readLessonNoteImageValue(element)
    : null;

  if (tagName === "img" && !isSafeSrc(src)) {
    element.remove();
    return;
  }

  if (tagName === "figure" && noteImageValue && !isSafeSrc(noteImageValue.src)) {
    element.remove();
    return;
  }

  Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));

  if (tagName === "a" && isSafeHref(href)) {
    element.setAttribute("href", href.trim());
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
  }

  if (tagName === "img" && isSafeSrc(src)) {
    element.setAttribute("src", src.trim());
    if (alt.trim()) {
      element.setAttribute("alt", alt.trim());
    }
    element.setAttribute("loading", "lazy");
  }

  if (tagName === "figure" && noteImageValue && isSafeSrc(noteImageValue.src)) {
    element.classList.add(LESSON_NOTE_IMAGE_CLASS);
    applyLessonNoteImageValue(element, noteImageValue);
  }
};

export const sanitizeRichText = (value?: string | null) => {
  if (!value) {
    return "";
  }

  if (typeof document === "undefined" || typeof Node === "undefined") {
    return escapeHtml(value);
  }

  const template = document.createElement("template");
  template.innerHTML = value;
  Array.from(template.content.childNodes).forEach(sanitizeNode);
  return template.innerHTML;
};

export const stripRichText = (value?: string | null) => {
  const sanitized = sanitizeRichText(value);
  if (!sanitized) {
    return "";
  }

  if (typeof document === "undefined") {
    return sanitized.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const element = document.createElement("div");
  element.innerHTML = sanitized;
  return (element.textContent || element.innerText || "").replace(/\s+/g, " ").trim();
};

export const hasRichTextMedia = (value?: string | null) => {
  const sanitized = sanitizeRichText(value);
  if (!sanitized || typeof document === "undefined") {
    return false;
  }

  const element = document.createElement("div");
  element.innerHTML = sanitized;
  return Boolean(element.querySelector("img"));
};

export const isRichTextEmpty = (value?: string | null) =>
  stripRichText(value).length === 0 && !hasRichTextMedia(value);
