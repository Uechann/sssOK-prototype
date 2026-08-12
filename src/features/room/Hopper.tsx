/** 업로드/다운로드 진행 연출 — 사진이 구멍으로 쏙 들어가(또는 나와) 옮겨지는 느낌 */
export function Hopper({ direction }: { direction: 'upload' | 'download' }) {
  return (
    <span className="hopper" data-direction={direction} aria-hidden="true">
      <span className="hopper__card" />
      <span className="hopper__card" />
      <span className="hopper__card" />
      <span className="hopper__hole" />
    </span>
  );
}
