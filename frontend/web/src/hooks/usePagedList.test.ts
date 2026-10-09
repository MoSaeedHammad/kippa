import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePagedList } from './usePagedList';

describe('usePagedList', () => {
  it('slices the current page and exposes the page count', () => {
    const { result } = renderHook(() => usePagedList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10));
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.current.pageCount).toBe(2);
    expect(result.current.total).toBe(12);
  });

  it('moves between pages', () => {
    const { result } = renderHook(() => usePagedList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10));
    act(() => result.current.setPage(2));
    expect(result.current.pageItems).toEqual([11, 12]);
    expect(result.current.page).toBe(2);
  });

  it('clamps the page when the list shrinks below the requested page', () => {
    const { result, rerender } = renderHook(({ items }) => usePagedList(items, 10), {
      initialProps: { items: Array.from({ length: 25 }, (_, i) => i) },
    });
    act(() => result.current.setPage(3));
    rerender({ items: Array.from({ length: 5 }, (_, i) => i) });
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps at least one page for an empty list', () => {
    const { result } = renderHook(() => usePagedList<number>([], 10));
    expect(result.current.pageCount).toBe(1);
    expect(result.current.pageItems).toEqual([]);
  });
});
