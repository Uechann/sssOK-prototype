import { mascots, type MascotName } from '../assets/mascots';

/** 쏙 마스코트(두더지).
 * 확정된 포즈는 /img 의 실제 아트를 쓰고,
 * 아직 아트가 없는 포즈(팻말·경고·휴지통·실패)만 임시 SVG로 그립니다. */

const ORANGE = '#F66D3B';
const ORANGE_DEEP = '#E15C2C';
const DARK = '#2D2419';
const LINE = '#1F1A13';

export type MascotPose =
  | 'peek' // 구멍에서 빼꼼 (빈 폴더)
  | 'wave' // 손 흔들기 (온보딩)
  | 'photo' // 사진 들고 있기 (방 만들기)
  | 'hole' // 구멍 + 사진 (빈 메인보드)
  | 'close' // CLOSE 팻말 (방 만료)
  | 'alert' // 경고 (방 삭제)
  | 'trash' // 휴지통 (사진 삭제)
  | 'folderX' // 폴더 삭제
  | 'sad'; // 업로드/다운로드 실패

/** 실제 아트가 준비된 포즈 */
const POSE_ART: Partial<Record<MascotPose, MascotName>> = {
  peek: 'peek',
  wave: 'wave',
  photo: 'photo',
  hole: 'waveWithPhoto',
  close: 'close',
  trash: 'trash',
  alert: 'alert',
  sad: 'sad',
};

/* ── 아트 이미지 ─────────────────────────────────────── */

export function MascotImage({
  name,
  size = 200,
  className,
}: {
  name: MascotName;
  size?: number;
  className?: string;
}) {
  const art = mascots[name];
  return (
    <img
      className={className}
      src={art.src}
      alt={art.alt}
      width={size}
      height={Math.round(size / art.ratio)}
      style={{ width: size, maxWidth: '100%', height: 'auto' }}
      draggable={false}
    />
  );
}

export function Mascot({
  pose,
  size = 200,
  className,
}: {
  pose: MascotPose;
  size?: number;
  className?: string;
}) {
  const name = POSE_ART[pose];
  if (name) return <MascotImage name={name} size={size} className={className} />;

  return (
    <div className={className} style={{ width: size, maxWidth: '100%' }}>
      <div style={{ position: 'relative', paddingTop: '65%' }}>
        <div style={{ position: 'absolute', inset: 0 }}>{renderPose(pose)}</div>
      </div>
    </div>
  );
}

/* ── 임시 SVG 포즈 (폴더 삭제만 아직 아트가 없습니다) ── */

const Face = () => (
  <g>
    <g fill={LINE}>
      <ellipse cx="86" cy="74" rx="5.2" ry="5.6" />
      <ellipse cx="114" cy="74" rx="5.2" ry="5.6" />
    </g>
    <path d="M89 87 Q100 97 111 87" stroke={LINE} strokeWidth="3.4" fill="none" strokeLinecap="round" />
  </g>
);

const Paw = ({ x, y = 100 }: { x: number; y?: number }) => (
  <g>
    <path
      d={`M${x - 11} ${y + 4} q0 -11 11 -11 q11 0 11 11 z`}
      fill={ORANGE}
      stroke={LINE}
      strokeWidth="3.6"
      strokeLinejoin="round"
    />
    <path
      d={`M${x - 4} ${y - 6} v6M${x + 4} ${y - 6} v6`}
      stroke={LINE}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </g>
);

const PhotoCard = ({
  x,
  y,
  rotate = -8,
  scale = 1,
  cross = false,
}: {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
  cross?: boolean;
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
    <rect x="-26" y="-19" width="52" height="38" rx="6" fill="#FFFFFF" stroke={LINE} strokeWidth="3.4" />
    {cross ? (
      <path d="M-9 -9 L9 9M9 -9 L-9 9" stroke="#F13337" strokeWidth="4.5" strokeLinecap="round" />
    ) : (
      <>
        <circle cx="-11" cy="-7" r="4.2" fill={ORANGE} />
        <path d="M-22 12 L-6 -3 L4 7 L11 0 L22 12 Z" fill={ORANGE_DEEP} />
      </>
    )}
  </g>
);

function Scene({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 200 130" role="img" aria-label={label} width="100%" height="100%">
      {children}
    </svg>
  );
}

function renderPose(pose: MascotPose) {
  switch (pose) {
    case 'folderX':
      return (
        <Scene label="사진에 엑스 표시가 뜬 두더지">
          <ellipse cx="96" cy="104" rx="56" ry="16" fill={DARK} />
          <path d="M70 104 C70 62 122 62 122 104" fill={ORANGE} stroke={LINE} strokeWidth="4.5" />
          <g transform="translate(-4 14)">
            <Face />
          </g>
          <g transform="translate(146 44)">
            <PhotoCard x={0} y={0} rotate={-8} scale={0.86} cross />
          </g>
          <path d="M40 104 A56 16 0 0 0 152 104 Z" fill={DARK} />
          <Paw x={78} />
          <Paw x={116} />
        </Scene>
      );

    default:
      return null;
  }
}

/** 스플래시 로고 — 아치형 sssOK 워드마크 + 빼꼼 두더지 */
export function Wordmark({ size = 220 }: { size?: number }) {
  return (
    <div style={{ width: size, maxWidth: '100%', textAlign: 'center' }}>
      <svg viewBox="0 0 200 66" width="100%" role="img" aria-label="쏙 sssOK" style={{ display: 'block' }}>
        <defs>
          {/* 완만한 아치 — 글자가 과하게 기울지 않도록 반지름을 크게 잡습니다 */}
          <path id="sssok-arc" d="M26 60 A210 210 0 0 1 174 60" fill="none" />
        </defs>
        <text fontSize="40" fontWeight="900" fill={DARK} fontFamily="inherit">
          <textPath href="#sssok-arc" startOffset="50%" textAnchor="middle">
            sssOK
          </textPath>
        </text>
      </svg>
      <MascotImage name="peek" size={size * 0.86} className="wordmark__art" />
    </div>
  );
}
