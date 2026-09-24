import slugMappings from "../../data/slug-mappings/zh-CN.json" with { type: "json" };

const KNOWN_SLUGS: Record<string, string> = slugMappings;

export function toFeatureSlug(value: string): string {
  const normalized = value.trim().toLowerCase();
  const known = KNOWN_SLUGS[normalized] ?? KNOWN_SLUGS[value.trim()];

  if (known) {
    return known;
  }

  const asciiSlug = normalized
    .replace(/\+/g, "p")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (asciiSlug) {
    return asciiSlug;
  }

  return `zh_${hashString(value)}`;
}

function hashString(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36);
}
