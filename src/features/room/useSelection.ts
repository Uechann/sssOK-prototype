import { useCallback, useEffect, useRef, useState } from 'react';
import { action } from '../../lib/analytics';

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

  /* ── 계측 ─────────────────────────────────────────────
   * 선택은 "0장 → 고름 → 무언가 함(또는 안 함) → 0장"의 한 덩어리로 봅니다.
   * 어떤 방식으로 골랐는지와, 고르고 나서 결국 무엇을 했는지를 함께 남깁니다.
   * 고르기만 하고 아무것도 안 한 경우가 "하고 싶은 게 없었다"는 신호입니다. */
  const episode = useRef<{ methods: Set<string>; peak: number; outcome: string } | null>(null);

  const mark = useCallback((method: string) => {
    if (!episode.current) episode.current = { methods: new Set(), peak: 0, outcome: '' };
    episode.current.methods.add(method);
  }, []);

  /** 선택으로 실제 무언가를 했을 때 RoomScreen이 알려줍니다 */
  const setOutcome = useCallback((name: string) => {
    if (episode.current) episode.current.outcome = name;
  }, []);

  const endEpisode = useCallback((fallback: string) => {
    const current = episode.current;
    if (!current || current.peak === 0) {
      episode.current = null;
      return;
    }
    action('selection.end', {
      methods: [...current.methods].sort().join('+') || 'unknown',
      peak: current.peak,
      outcome: current.outcome || fallback,
    });
    episode.current = null;
  }, []);

  useEffect(() => {
    const size = selected.size;
    if (size > 0) {
      if (!episode.current) episode.current = { methods: new Set(), peak: 0, outcome: '' };
      episode.current.peak = Math.max(episode.current.peak, size);
    } else if (episode.current) {
      endEpisode('none');
    }
  }, [selected, endEpisode]);

  // 선택해둔 채로 화면을 떠난 경우도 "아무것도 안 함"입니다
  useEffect(() => () => endEpisode('left'), [endEpisode]);

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
    mark('all');
    setSelected(new Set(orderedIds));
  }, [mark, orderedIds]);

  const toggle = useCallback(
    (id: string, options?: { shift?: boolean }) => {
      mark(options?.shift ? 'range' : 'single');
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
    [mark, orderedIds],
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

  const idsInCellRange = useCallback((anchorId: string, clientX: number, clientY: number) => {
    const grid = gridRef.current;
    const firstTile = grid?.querySelector<HTMLElement>('[data-photo-id]');
    const anchorIndex = orderedIds.indexOf(anchorId);
    if (!grid || !firstTile || anchorIndex < 0) return [];

    const styles = getComputedStyle(grid);
    const columns = Math.max(1, styles.gridTemplateColumns.split(' ').filter(Boolean).length);
    const columnGap = Number.parseFloat(styles.columnGap) || 0;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const first = firstTile.getBoundingClientRect();
    const totalRows = Math.ceil(orderedIds.length / columns);
    const currentColumn = Math.max(
      0,
      Math.min(columns - 1, Math.floor((clientX - first.left + columnGap / 2) / (first.width + columnGap))),
    );
    const currentRow = Math.max(
      0,
      Math.min(totalRows - 1, Math.floor((clientY - first.top + rowGap / 2) / (first.height + rowGap))),
    );
    const pointedIndex = Math.min(orderedIds.length - 1, currentRow * columns + currentColumn);
    const start = Math.min(anchorIndex, pointedIndex);
    const end = Math.max(anchorIndex, pointedIndex);
    return orderedIds.slice(start, end + 1);
  }, [orderedIds]);

  const scrollSpeed = (clientY: number, host: HTMLElement) => {
    const bounds = host.getBoundingClientRect();
    const edge = 64;
    if (clientY < bounds.top + edge) {
      return -Math.ceil(Math.min(1, (bounds.top + edge - clientY) / edge) * 18);
    }
    if (clientY > bounds.bottom - edge) {
      return Math.ceil(Math.min(1, (clientY - (bounds.bottom - edge)) / edge) * 18);
    }
    return 0;
  };

  const onMarqueeStart = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button')) return;
      const grid = gridRef.current;
      if (!grid) return;

      const base = event.shiftKey || event.metaKey ? new Set(selected) : new Set<string>();
      const hostRect = grid.getBoundingClientRect();
      const scrollHost = grid.closest<HTMLElement>('.gallery-scroll');
      const startedOnTile = Boolean((event.target as HTMLElement).closest('[data-photo-id]'));
      const startX = event.clientX - hostRect.left;
      const startY = event.clientY - hostRect.top;
      dragState.current = { x: startX, y: startY, base };
      let moved = false;
      let clientX = event.clientX;
      let clientY = event.clientY;
      let frame = 0;

      const update = () => {
        const start = dragState.current;
        if (!start) return;
        const bounds = grid.getBoundingClientRect();
        const currentX = clientX - bounds.left;
        const currentY = clientY - bounds.top;
        const left = Math.min(start.x, currentX);
        const top = Math.min(start.y, currentY);
        const width = Math.abs(currentX - start.x);
        const height = Math.abs(currentY - start.y);
        if (!moved && width + height < 6) return;
        if (!moved) mark('marquee');
        moved = true;

        setMarquee({ left, top, width, height });
        const hits = idsInRect(new DOMRect(bounds.left + left, bounds.top + top, width, height));
        setSelected(new Set([...start.base, ...hits]));
      };

      const autoScroll = () => {
        if (!dragState.current) return;
        if (scrollHost) {
          const speed = scrollSpeed(clientY, scrollHost);
          if (speed !== 0) {
            scrollHost.scrollTop += speed;
            update();
          }
        }
        frame = requestAnimationFrame(autoScroll);
      };

      const onMove = (move: MouseEvent) => {
        clientX = move.clientX;
        clientY = move.clientY;
        update();
      };

      const onUp = () => {
        // 빈 공간 클릭(드래그 없이) → 선택 해제
        if (!moved && !startedOnTile) clear();
        if (moved) suppressMarqueeClick.current = true;
        dragState.current = null;
        cancelAnimationFrame(frame);
        setMarquee(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      frame = requestAnimationFrame(autoScroll);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [clear, idsInRect, mark, selected],
  );

  const suppressMarqueeClick = useRef(false);
  const consumeMarqueeClick = useCallback(() => {
    if (!suppressMarqueeClick.current) return false;
    suppressMarqueeClick.current = false;
    return true;
  }, []);

  /* ── 슬라이드 선택 (모바일) ────────────────────────── */
  const slideState = useRef<{
    on: boolean;
    base: Set<string>;
    anchorId: string;
    clientX: number;
    clientY: number;
    frame: number;
  } | null>(null);

  const onSlideStart = useCallback(
    (id: string, clientX: number, clientY: number) => {
      mark('slide');
      const on = !selected.has(id);
      const base = new Set(selected);
      const next = new Set(base);
      if (on) next.add(id);
      else next.delete(id);
      setSelected(next);

      const state = { on, base, anchorId: id, clientX, clientY, frame: 0 };
      slideState.current = state;

      const autoScroll = () => {
        const current = slideState.current;
        const grid = gridRef.current;
        const scrollHost = grid?.closest<HTMLElement>('.gallery-scroll');
        if (!current || !grid || !scrollHost) return;
        const speed = scrollSpeed(current.clientY, scrollHost);
        if (speed !== 0) {
          scrollHost.scrollTop += speed;
          applySlideRange(current);
        }
        current.frame = requestAnimationFrame(autoScroll);
      };
      state.frame = requestAnimationFrame(autoScroll);
    },
    [mark, selected],
  );

  const applySlideRange = useCallback(
    (state: NonNullable<typeof slideState.current>) => {
      const hits = idsInCellRange(state.anchorId, state.clientX, state.clientY);
      const next = new Set(state.base);
      hits.forEach((id) => (state.on ? next.add(id) : next.delete(id)));
      setSelected(next);
    },
    [idsInCellRange],
  );

  const onSlideMove = useCallback(
    (event: React.TouchEvent) => {
      const state = slideState.current;
      if (!state) return;
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      state.clientX = touch.clientX;
      state.clientY = touch.clientY;
      applySlideRange(state);
    },
    [applySlideRange],
  );

  const onSlideEnd = useCallback(() => {
    const state = slideState.current;
    if (state) cancelAnimationFrame(state.frame);
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
    setOutcome,
    gridRef,
    marquee,
    onMarqueeStart,
    consumeMarqueeClick,
    onSlideStart,
    onSlideMove,
    onSlideEnd,
    sliding,
  };
}
