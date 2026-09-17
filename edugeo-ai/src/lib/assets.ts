const IMAGE_URL_PREFIXES = /^(https?:\/\/|data:image\/|blob:|\/api\/source-assets\/)/i;

function encodeAssetPath(assetPath: string): string {
  return assetPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");
}

export function normalizeAssetUrl(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(raw)) return raw;

  const clean = raw.replace(/\\/g, "/");
  const sourceAssetIndex = clean.indexOf("/source-assets/");
  if (sourceAssetIndex >= 0) {
    return `/api/source-assets/${encodeAssetPath(clean.slice(sourceAssetIndex + "/source-assets/".length))}`;
  }
  if (clean.startsWith("source-assets/")) {
    return `/api/source-assets/${encodeAssetPath(clean.slice("source-assets/".length))}`;
  }
  if (clean.startsWith("api/source-assets/")) {
    return `/api/source-assets/${encodeAssetPath(clean.slice("api/source-assets/".length))}`;
  }
  if (/^(images|pages)\//i.test(clean)) {
    return `/api/source-assets/${encodeAssetPath(clean)}`;
  }
  return clean;
}

export function isDisplayableImageUrl(value?: string | null): boolean {
  return IMAGE_URL_PREFIXES.test(normalizeAssetUrl(value));
}
