import { useEffect, useRef, useState } from 'react';

const CATCH_UP_RATE = 0.12; // 목표까지 남은 거리의 12%씩 좁혀갑니다
const MIN_STEP = 0.4; // 최소 속도 — 업데이트 사이가 길어도 멈춰 보이지 않게
const SNAP_EPSILON = 0.3;

/**
 * 실제 진행률은 (특히 로컬 blob 다운로드·단계식 업로드 연출처럼) 뜨문뜨문
 * 큰 폭으로 들어옵니다. 목표값을 그대로 그리면 "멈춰있다 갑자기 훅 뛰는"
 * 느낌이 나서, 매 프레임 목표를 향해 조금씩 따라가는 표시값을 대신 반환합니다.
 *
 * effect를 하나로 유지합니다 — setup/cleanup을 나누면 StrictMode의
 * 이중 실행(mount→cleanup→mount)에서 cleanup만 루프를 취소하고
 * rafId는 안 지워져서 다시는 안 도는 상태가 됩니다.
 */
export function useSmoothedPercent(target: number): number {
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  const targetRef = useRef(target);

  targetRef.current = target;

  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const current = displayedRef.current;
      const goal = targetRef.current;
      const diff = goal - current;
      const next =
        Math.abs(diff) < SNAP_EPSILON
          ? goal
          : current + Math.sign(diff) * Math.max(Math.abs(diff) * CATCH_UP_RATE, MIN_STEP);

      if (next !== current) {
        displayedRef.current = next;
        setDisplayed(next);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return Math.round(displayed);
}
