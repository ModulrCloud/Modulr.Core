/** First configured Core base URL, no trailing slash. */
export function primaryCoreBaseUrl(endpoints: string[]): string {
  const first = endpoints[0]?.trim() ?? "";
  return first.replace(/\/+$/, "");
}
