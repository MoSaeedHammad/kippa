import { useState } from 'react';

/**
 * Client-side pagination for in-memory lists: data is already fully loaded,
 * so paging is a pure slice. `page` clamps automatically when the list
 * shrinks (filters, approvals, deletes), so a stale page never renders empty.
 */
export function usePagedList<T>(items: T[], pageSize = 10) {
  const [requestedPage, setRequestedPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  return {
    page,
    pageCount,
    total: items.length,
    pageItems: items.slice(start, start + pageSize),
    setPage: setRequestedPage,
  };
}
