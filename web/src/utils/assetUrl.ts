/**
 * Resolve public asset paths safely across both localhost ("/") and GitHub Pages ("/jp-pixel-story/").
 */
export function resolveAssetUrl(rawPath: string): string {
  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }
  const clean = rawPath.replace(/^\/+/, "");
  const base = import.meta.env.BASE_URL || "./";
  if (base.endsWith("/")) {
    return `${base}${clean}`;
  }
  return `${base}/${clean}`;
}
