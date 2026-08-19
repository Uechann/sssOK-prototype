/** 개발자용 계측 대시보드 — `#/admin`
 *
 * 사용자 동선에는 없는 화면입니다. 유저 테스트 회고용이라 집계 숫자보다
 * "누가 어디서 멈췄는지"를 한 명씩 볼 수 있는 세션 타임라인에 무게를 뒀습니다.
 * n이 수십 명일 때는 퍼센트보다 개별 여정이 훨씬 많은 걸 알려줍니다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TrackedEvent } from '../lib/analytics';
import { fetchEvents } from '../store/events';
import { firebaseEnabled } from '../lib/firebase';
import {
  buildSessions,
  engagement,
  failures,
  guestFunnel,
  hostFunnel,
  discovery,
  screenStats,
  sources,
  transfers,
  type FunnelStep,
  type Session,
} from './adminStats';
import './admin.css';

const RANGES = [
  { key: 'all', label: '전체' },
  { key: '7d', label: '7일' },
  { key: '24h', label: '24시간' },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

/** 화면 이름을 사람 말로 — 없는 이름은 그대로 보여줍니다 */
const SCREEN_LABEL: Record<string, string> = {
  onboarding: '온보딩',
  room_create_form: '방 만들기 폼',
  join: '코드 입력',
  name_gate: '이름 입력',
  'room.gallery': '방 · 갤러리',
  'room.folder': '방 · 폴더 안',
  'room.lightbox': '자세히 보기',
  'room.download': '다운로드 방식 시트',
  'room.qr': 'QR 모달',
  'room.move': '폴더 이동 시트',
  'room.folderCreate': '폴더 만들기',
  'room.folderRename': '폴더 이름 변경',
  'room.folderDelete': '폴더 삭제 확인',
  'room.roomDelete': '방 삭제 확인',
  'room.deletePhotos': '사진 삭제 확인',
  'room.downloadFail': '다운로드 실패 안내',
  'room.settings': '방 설정',
  'room.gallery.empty': '방 · 빈 갤러리',
  'room.folder.empty': '방 · 빈 폴더',
  'room.filter.empty': '방 · 필터 결과 없음',
  'room.filter': '방 · 필터 결과',
  room_expired: '방 만료 화면',
  invalid_link: '잘못된 링크',
  offline: '오프라인',
};
const label = (name: string) => SCREEN_LABEL[name] ?? name;

const DIALOG_LABEL: Record<string, string> = {
  download: '다운로드 방식 시트',
  move: '폴더 이동 시트',
  folderCreate: '폴더 만들기',
  folderRename: '폴더 이름 변경',
  folderDelete: '폴더 삭제 확인',
  roomDelete: '방 삭제 확인',
  deletePhotos: '사진 삭제 확인',
  qr: 'QR 모달',
  downloadFail: '다운로드 실패 안내',
  sizeLimit: '용량 초과 안내',
  uploadFail: '업로드 실패 안내',
};
const dialogLabel = (name: string) => DIALOG_LABEL[name] ?? name;

const FAIL_LABEL: Record<string, string> = {
  'join.code_not_found': '코드 입력 — 없는 코드',
  'join.wrong_passcode': '코드 입력 — 암호 틀림',
  'join.expired': '코드 입력 — 이미 사라진 방',
  'entry.invalid_link': '잘못된 링크로 진입',
  'entry.offline': '오프라인이라 방을 못 엶',
  'upload.file': '업로드 실패 (파일별)',
  'upload.oversize': '용량 초과로 시작도 못 함',
  'download.all_failed': '다운로드 전부 실패',
  'download.save_failed': '내려받고 저장에서 실패',
};
const failLabel = (name: string) => FAIL_LABEL[name] ?? name;

function ms(value: number): string {
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}초`;
  const m = Math.floor(value / 60_000);
  const s = Math.round((value % 60_000) / 1000);
  return `${m}분 ${s}초`;
}

const clock = (ts: number) =>
  new Date(ts).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function Funnel({ title, steps }: { title: string; steps: FunnelStep[] }) {
  const top = steps[0]?.reached ?? 0;
  return (
    <div className="ad-funnel">
      <h3>{title}</h3>
      {top === 0 ? (
        <p className="ad-empty">아직 데이터가 없어요.</p>
      ) : (
        <>
        <ol>
          {steps.map((step, i) => (
            <li key={step.key}>
              <div className="ad-funnel__row">
                <span className="ad-funnel__label">{step.label}</span>
                <span className="ad-funnel__num">{step.reached}</span>
                {i > 0 && <span className="ad-funnel__rate">{step.rate}%</span>}
              </div>
              <div className="ad-bar">
                <div className="ad-bar__fill" style={{ width: `${(step.reached / top) * 100}%` }} />
              </div>
              {i > 0 && step.lost > 0 && (
                <div className="ad-funnel__lost">↓ {step.lost}명 이탈</div>
              )}
            </li>
          ))}
        </ol>
        <p className="ad-funnel__note">
          뒤 단계에 도달했으면 앞 단계도 지나온 것으로 셉니다. 이름 입력처럼 조건에 따라 건너뛰는
          화면이 있어서, 그렇게 세지 않으면 통과율이 100%를 넘습니다.
        </p>
        </>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const roleLabel = { host: '호스트', guest: '게스트', anon: '미진입' }[session.role];
  const timeline = session.events.filter((e) => e.kind !== 'ping');

  return (
    <li className="ad-session" data-open={open}>
      <button type="button" className="ad-session__head" onClick={() => setOpen((v) => !v)}>
        <span className="ad-session__time">{clock(session.start)}</span>
        <span className="ad-chip" data-role={session.role}>
          {roleLabel}
        </span>
        <span className="ad-chip">{session.src === 'qr' ? 'QR' : session.src === 'link' ? '링크' : '직접'}</span>
        <span className="ad-session__dur">{ms(session.activeMs)}</span>
        <span className="ad-session__last">
          {session.droppedOff ? '이탈 → ' : '종료 · '}
          {label(session.lastScreen ?? '-')}
        </span>
        {session.failCount > 0 && <span className="ad-chip" data-tone="danger">실패 {session.failCount}</span>}
        {session.visitIndex > 1 && <span className="ad-chip" data-tone="good">재방문 {session.visitIndex}회차</span>}
        <span className="ad-session__meta">
          {session.vw < 768 ? '모바일' : 'PC'} · {session.did.slice(-4)}
        </span>
      </button>

      {open && (
        <ol className="ad-timeline">
          {timeline.map((e) => (
            <li key={e.id} data-kind={e.kind}>
              <span className="ad-timeline__at">+{ms(e.ts - session.start)}</span>
              <span className="ad-timeline__name">
                {e.kind === 'screen' || e.kind === 'screen_end' ? label(e.name) : e.name}
                {e.kind === 'screen_end' && e.ms !== undefined && (
                  <em className="ad-timeline__dwell"> {ms(e.ms)} 머무름</em>
                )}
              </span>
              {e.meta && (
                <span className="ad-timeline__meta">
                  {Object.entries(e.meta)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' ')}
                </span>
              )}
              {e.scenario && <span className="ad-chip" data-tone="warn">시나리오</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export function Admin({ onHome }: { onHome: () => void }) {
  const [events, setEvents] = useState<TrackedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('all');
  const [hideScenario, setHideScenario] = useState(true);
  // 로컬 모드에서는 데이터가 전부 localhost에서 나오므로 기본으로 걸러내면 화면이 비어버립니다
  const [hideDev, setHideDev] = useState(firebaseEnabled);

  const load = useCallback(() => {
    setError(null);
    fetchEvents()
      .then(setEvents)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '불러오지 못했어요'));
  }, []);

  useEffect(load, [load]);

  const sessions = useMemo(() => {
    if (!events) return [];
    const since =
      range === '24h' ? Date.now() - 86_400_000 : range === '7d' ? Date.now() - 7 * 86_400_000 : 0;
    const filtered = events.filter((e) => e.ts >= since && !(hideScenario && e.scenario));
    return buildSessions(filtered).filter((s) => !(hideDev && s.dev));
  }, [events, range, hideScenario, hideDev]);

  const host = useMemo(() => hostFunnel(sessions), [sessions]);
  const guest = useMemo(() => guestFunnel(sessions), [sessions]);
  const screens = useMemo(() => screenStats(sessions), [sessions]);
  const fails = useMemo(() => failures(sessions), [sessions]);
  const transfer = useMemo(() => transfers(sessions), [sessions]);
  const bySource = useMemo(() => sources(sessions), [sessions]);
  const react = useMemo(() => engagement(sessions), [sessions]);
  const found = useMemo(() => discovery(sessions), [sessions]);
  const dropped = sessions.filter((s) => s.droppedOff).length;

  return (
    <div className="screen admin">
      <header className="ad-top">
        <div>
          <h1>계측 대시보드</h1>
          <p>
            {firebaseEnabled ? 'Firestore' : '이 브라우저(로컬 모드)'} · 이벤트{' '}
            {events?.length ?? 0}건 · 세션 {sessions.length}개
          </p>
        </div>
        <div className="ad-top__actions">
          <button type="button" onClick={load}>새로고침</button>
          <button type="button" onClick={onHome}>앱으로</button>
        </div>
      </header>

      <div className="ad-filters">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            data-on={range === r.key}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
        <label>
          <input
            type="checkbox"
            checked={hideScenario}
            onChange={(e) => setHideScenario(e.target.checked)}
          />
          시나리오 칩으로 만든 가짜 실패 제외
        </label>
        <label>
          <input type="checkbox" checked={hideDev} onChange={(e) => setHideDev(e.target.checked)} />
          localhost 접속 제외
        </label>
      </div>

      {error && <p className="ad-error">불러오지 못했어요 — {error}</p>}
      {!events && !error && <p className="ad-empty">불러오는 중…</p>}

      {events && (
        <>
          <section className="ad-cards">
            <div className="ad-card">
              <b>{sessions.length}</b>
              <span>세션</span>
            </div>
            <div className="ad-card">
              <b>{react.devices}</b>
              <span>기기</span>
            </div>
            <div className="ad-card">
              <b>{ms(react.medianActiveMs)}</b>
              <span>세션 체류 (중앙값)</span>
            </div>
            <div className="ad-card" data-tone="danger">
              <b>{dropped}</b>
              <span>화면을 닫지 않고 이탈</span>
            </div>
            <div className="ad-card">
              <b>{transfer.downloads}</b>
              <span>다운로드 · {transfer.downloadedFiles}장</span>
            </div>
            <div className="ad-card">
              <b>{transfer.uploads}</b>
              <span>업로드 · {transfer.uploadedFiles}장</span>
            </div>
          </section>

          <section className="ad-two">
            <Funnel title="호스트 — 방을 만든 사람" steps={host} />
            <Funnel title="게스트 — 링크로 들어온 사람" steps={guest} />
          </section>

          <section className="ad-panel">
            <h3>화면별 체류시간 · 이탈</h3>
            <table>
              <thead>
                <tr>
                  <th>화면</th>
                  <th>진입</th>
                  <th>중앙값</th>
                  <th>평균</th>
                  <th>여기서 이탈</th>
                </tr>
              </thead>
              <tbody>
                {screens.map((s) => (
                  <tr key={s.name} data-hot={s.exitRate >= 40}>
                    <td>{label(s.name)}</td>
                    <td>{s.entries}</td>
                    <td>{ms(s.medianMs)}</td>
                    <td>{ms(s.avgMs)}</td>
                    <td>
                      {s.exits}
                      {s.exits > 0 && <em> ({s.exitRate}%)</em>}
                    </td>
                  </tr>
                ))}
                {screens.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ad-empty">아직 데이터가 없어요.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="ad-two">
            <div className="ad-panel">
              <h3>실패한 지점</h3>
              <ul className="ad-rows">
                {fails.map((f) => (
                  <li key={f.label}>
                    <span>{failLabel(f.label)}</span>
                    <b>{f.count}</b>
                    {f.detail && <em>{f.detail}</em>}
                  </li>
                ))}
                {fails.length === 0 && <li className="ad-empty">실패 기록이 없어요.</li>}
              </ul>
            </div>

            <div className="ad-panel">
              <h3>유입 경로별 방 도달</h3>
              <ul className="ad-rows">
                {bySource.map((s) => (
                  <li key={s.label}>
                    <span>{s.label}</span>
                    <b>{s.count}</b>
                    <em>{s.detail}</em>
                  </li>
                ))}
                {bySource.length === 0 && <li className="ad-empty">아직 데이터가 없어요.</li>}
              </ul>
            </div>
          </section>

          <section className="ad-two">
            <div className="ad-panel">
              <h3>반응 (행동으로 추정)</h3>
              <ul className="ad-rows">
                <li>
                  <span>자세히 보기까지 간 비율</span>
                  <b>{react.lightboxRate}%</b>
                </li>
                <li>
                  <span>폴더를 쓴 비율</span>
                  <b>{react.folderRate}%</b>
                </li>
                <li>
                  <span>업로드를 두 번 이상</span>
                  <b>{react.repeatUploadRate}%</b>
                </li>
                <li>
                  <span>다시 찾아온 기기</span>
                  <b>
                    {react.returningDevices}/{react.devices}
                  </b>
                </li>
              </ul>
            </div>

            <div className="ad-panel">
              <h3>다운로드 · 업로드</h3>
              <ul className="ad-rows">
                {transfer.byMode.map((m) => (
                  <li key={m.label}>
                    <span>{m.label}</span>
                    <b>{m.count}</b>
                  </li>
                ))}
                <li>
                  <span>다운로드 실패</span>
                  <b>{transfer.downloadFails}</b>
                </li>
                <li>
                  <span>업로드 실패</span>
                  <b>{transfer.uploadFails}</b>
                </li>
                <li>
                  <span>실패 후 재시도</span>
                  <b>{transfer.retries}</b>
                </li>
              </ul>
            </div>
          </section>

          <section className="ad-panel ad-discovery">
            <h3>발굴 — 하려다 못 한 것</h3>
            <p className="ad-funnel__note">
              성공한 동작이 아니라 기대가 빗나간 순간들입니다. 다음에 무엇을 만들지는 대체로
              이쪽에서 나옵니다.
            </p>

            <h4>열었다가 그냥 닫은 시트 · 모달</h4>
            <table>
              <thead>
                <tr>
                  <th>다이얼로그</th>
                  <th>열림</th>
                  <th>확정</th>
                  <th>포기</th>
                  <th>포기율</th>
                  <th>이어서 연 것</th>
                </tr>
              </thead>
              <tbody>
                {found.dialogs.map((d) => (
                  <tr key={d.dialog} data-hot={d.opened >= 3 && d.dismissRate >= 50}>
                    <td>{dialogLabel(d.dialog)}</td>
                    <td>{d.opened}</td>
                    <td>{d.confirmed}</td>
                    <td>{d.dismissed}</td>
                    <td>{d.dismissRate}%</td>
                    <td>{d.chained || '-'}</td>
                  </tr>
                ))}
                {found.dialogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="ad-empty">아직 데이터가 없어요.</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="ad-two ad-two--tight">
              <div>
                <h4>아무 일도 안 일어난 곳을 누름</h4>
                <ul className="ad-rows">
                  {found.deadClicks.slice(0, 8).map((r) => (
                    <li key={r.label}>
                      <span>{r.label}</span>
                      <b>{r.count}</b>
                    </li>
                  ))}
                  {found.deadClicks.length === 0 && <li className="ad-empty">없어요.</li>}
                </ul>
              </div>
              <div>
                <h4>길게 누름 · 연타</h4>
                <ul className="ad-rows">
                  {found.longPress.slice(0, 6).map((r) => (
                    <li key={'lp' + r.label}>
                      <span>{r.label}</span>
                      <b>{r.count}</b>
                      <em>길게 누름</em>
                    </li>
                  ))}
                  {found.rageClicks.slice(0, 6).map((r) => (
                    <li key={'rc' + r.label}>
                      <span>{r.label}</span>
                      <b>{r.count}</b>
                      <em>연타</em>
                    </li>
                  ))}
                  {found.longPress.length + found.rageClicks.length === 0 && (
                    <li className="ad-empty">없어요.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="ad-two ad-two--tight">
              <div>
                <h4>
                  고르는 방식{' '}
                  <em className="ad-inline-note">선택 {found.selection.episodes}번</em>
                </h4>
                <ul className="ad-rows">
                  {found.selection.byMethod.slice(0, 6).map((r) => (
                    <li key={'m' + r.label}>
                      <span>{r.label}</span>
                      <b>{r.count}</b>
                    </li>
                  ))}
                  {found.selection.byMethod.length === 0 && <li className="ad-empty">없어요.</li>}
                </ul>
              </div>
              <div>
                <h4>고르고 나서 한 것</h4>
                <ul className="ad-rows">
                  {found.selection.byOutcome.map((r) => (
                    <li key={'o' + r.label}>
                      <span>{r.label}</span>
                      <b>{r.count}</b>
                    </li>
                  ))}
                  {found.selection.episodes > 0 && (
                    <li>
                      <span>고르기만 하고 아무것도 안 함</span>
                      <b>{found.selection.idleRate}%</b>
                      <em>한 번에 고른 장수 중앙값 {found.selection.medianPeak}장</em>
                    </li>
                  )}
                  {found.selection.byOutcome.length === 0 && <li className="ad-empty">없어요.</li>}
                </ul>
              </div>
            </div>

            <div className="ad-two ad-two--tight">
              <div>
                <h4>빈 화면에서 머문 시간</h4>
                <ul className="ad-rows">
                  {found.emptyScreens.map((s) => (
                    <li key={s.name}>
                      <span>{label(s.name)}</span>
                      <b>{ms(s.medianMs)}</b>
                      <em>
                        진입 {s.entries}회 · 여기서 이탈 {s.exits}회
                      </em>
                    </li>
                  ))}
                  {found.emptyScreens.length === 0 && <li className="ad-empty">없어요.</li>}
                </ul>
              </div>
              <div>
                <h4>방이 실제로 쓰인 모습</h4>
                <ul className="ad-rows">
                  <li>
                    <span>방당 사진 · 폴더 · 멤버 (중앙값)</span>
                    <b>
                      {found.shape.medianPhotos} · {found.shape.medianFolders} ·{' '}
                      {found.shape.medianMembers}
                    </b>
                    <em>방 {found.shape.rooms}개 기준</em>
                  </li>
                  <li>
                    <span>여럿인데 올린 사람은 하나뿐인 방</span>
                    <b>{found.shape.lurkerRoomRate}%</b>
                    <em>높으면 업로드 유도가 필요합니다</em>
                  </li>
                  <li>
                    <span>끝까지 혼자였던 방</span>
                    <b>{found.shape.soloRoomRate}%</b>
                    <em>높으면 초대 흐름이 실패한 것입니다</em>
                  </li>
                  <li>
                    <span>만료 후 · 다시 만들기 / 홈</span>
                    <b>
                      {found.expiredCreate} / {found.expiredHome}
                    </b>
                    <em>다시 만들기가 많으면 방 기간 연장 수요입니다</em>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="ad-panel">
            <h3>세션 타임라인 — 눌러서 펼치기</h3>
            <ul className="ad-sessions">
              {sessions.map((s) => (
                <SessionRow key={s.sid} session={s} />
              ))}
              {sessions.length === 0 && <li className="ad-empty">아직 데이터가 없어요.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
