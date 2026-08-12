import { useCallback, useEffect, useRef, useState } from 'react';

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 갤러리 선택 로직.
 * 웹 — 개별 / Shift 범위 / 드래그 영역 / 전체, 빈 공간 클릭 해제
 * 모바일 — 개별 / 슬라이드 선택 / 전체 */
export function useSelection(orderedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // 화면에서 사라진 사진은 선택에서도 빼줍니다
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(orderedIds);
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [orderedIds]);

  const clear = useCallback(() => {
    anchor.current = null;
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(orderedIds));
  }, [orderedIds]);

  const toggle = useCallback(
    (id: string, options?: { shift?: boolean }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (options?.shift && anchor.current) {
          const from = orderedIds.indexOf(anchor.current);
          const to = orderedIds.indexOf(id);
          if (from !== -1 && to !== -1) {
            const [start, end] = from < to ? [from, to] : [to, from];
            for (let i = start; i <= end; i += 1) next.add(orderedIds[i]);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        anchor.current = id;
        return next;
      });
    },
    [orderedIds],
  );

  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  /* ── 드래그 영역 선택 (웹) ─────────────────────────── */
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const dragState = useRef<{ x: number; y: number; base: Set<string> } | null>(null);

  const idsInRect = useCallback((rect: DOMRect) => {
    const grid = gridRef.current;
    if (!grid) return [];
    return Array.from(grid.querySelectorAll<HTMLElement>('[data-photo-id]'))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return (
          box.left < rect.right &&
          box.right > rect.left &&
          box.top < rect.bottom &&
          box.bottom > rect.top
        );
      })
      .map((el) => el.dataset.photoId as string);
  }, []);

  const onMarqueeStart = useCallback(
    (event: React.MouseEvent) => {
      // 타일이 아닌 빈 공간에서 시작한 드래그만 영역 선택
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('[data-photo-id]')) return;
      const grid = gridRef.current;
      if (!grid) return;

      const base = event.shiftKey || event.metaKey ? new Set(selected) : new Set<string>();
      dragState.current = { x: event.clientX, y: event.clientY, base };
      let moved = false;

      const onMove = (move: MouseEvent) => {
        const start = dragState.current;
        if (!start) return;
        const left = Math.min(start.x, move.clientX);
        const top = Math.min(start.y, move.clientY);
        const width = Math.abs(move.clientX - start.x);
        const height = Math.abs(move.clientY - start.y);
        if (!moved && width + height < 6) return;
        moved = true;

        const host = grid.getBoundingClientRect();
        setMarquee({ left: left - host.left, top: top - host.top, width, height });
        const hits = idsInRect(new DOMRect(left, top, width, height));
        setSelected(new Set([...start.base, ...hits]));
      };

      const onUp = () => {
        // 빈 공간 클릭(드래그 없이) → 선택 해제
        if (!moved) clear();
        dragState.current = null;
        setMarquee(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [clear, idsInRect, selected],
  );

  /* ── 슬라이드 선택 (모바일) ────────────────────────── */
  const slideState = useRef<{ on: boolean; seen: Set<string> } | null>(null);

  const onSlideStart = useCallback(
    (id: string) => {
      const on = !selected.has(id);
      slideState.current = { on, seen: new Set([id]) };
      setMany([id], on);
    },
    [selected, setMany],
  );

  const onSlideMove = useCallback(
    (event: React.TouchEvent) => {
      const state = slideState.current;
      if (!state) return;
      const touch = event.touches[0];
      if (!touch) return;
      const el = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest<HTMLElement>('[data-photo-id]');
      const id = el?.dataset.photoId;
      if (!id || state.seen.has(id)) return;
      state.seen.add(id);
      setMany([id], state.on);
    },
    [setMany],
  );

  const onSlideEnd = useCallback(() => {
    slideState.current = null;
  }, []);

  const sliding = () => slideState.current !== null;

  return {
    selected,
    count: selected.size,
    isSelected: (id: string) => selected.has(id),
    toggle,
    clear,
    selectAll,
    setMany,
    gridRef,
    marquee,
    onMarqueeStart,
    onSlideStart,
    onSlideMove,
    onSlideEnd,
    sliding,
  };
}
