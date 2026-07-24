/**
 * Drain an offset-paged list endpoint. The Yuque API caps `limit` at 100,
 * so --all style commands loop until a short page comes back.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 100
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

/**
 * Drain a page-number endpoint whose response explicitly reports whether a
 * next page exists. Unlike offset pagination, item counts do not determine
 * completion; the server's `has_more` flag does.
 */
export async function fetchAllHasMorePages<T extends { has_more?: boolean }>(
  fetchPage: (page: number) => Promise<T>,
  firstPage = 1
): Promise<T[]> {
  const pages: T[] = [];
  for (let page = firstPage; ; page++) {
    const result = await fetchPage(page);
    pages.push(result);
    if (!result.has_more) return pages;
  }
}
