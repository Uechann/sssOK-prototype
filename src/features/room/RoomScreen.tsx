import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as amplitude from '@amplitude/unified';
import type { Photo, PhotoFilter, Room } from '../../types';
import { useStore, useRoomActions, type Me } from '../../store/store';
import { useIsDesktop, useOnline, useRemaining } from '../../lib/hooks';
import { inviteUrl } from '../../lib/router';
import { uid } from '../../lib/format';
import { blobStore } from '../../lib/idb';
import { Mascot, MascotImage } from '../../components/Mascot';
import { firebaseEnabled } from '../../lib/firebase';
import { action, screen, setScenario } from '../../lib/analytics';
import { AMPLITUDE_EVENTS } from '../../lib/amplitudeEvents';
import { Popover, PopoverItem, PopoverSeparator } from '../../components/ui';
import {
  IconChevronUp,
  IconFolderEdit,
  IconFolderPlus,
  IconFolderX,
  IconLink,
  IconPlus,
  IconQr,
  IconSliders,
  IconTrash,
} from '../../components/Icons';
import { RoomHeader } from './RoomHeader';
import { Gallery } from './Gallery';
import { NetworkBanner, SelectionBar, TransferBar } from './DockBars';
import { Lightbox } from './Lightbox';
import {
  DeleteFolderModal,
  DeletePhotosModal,
  DeleteRoomModal,
  DownloadFailModal,
  DownloadSheet,
  FolderSheet,
  MoveSheet,
  NameSheet,
  QrModal,
  SaveToPhotosSheet,
  SizeLimitModal,
  UploadFailModal,
} from './dialogs';
import { useSelection } from './useSelection';
import { useUpload } from './useUpload';
import { canSaveToPhotos, useDownload, type DownloadMode } from './useDownload';
import './room.css';

// 내부 QA용 시나리오는 기능을 보존하되 사용자 화면에서는 노출하지 않습니다.
const SHOW_DEMO_SCENARIOS = false;

function uploadedMessage(uploaded: Photo[]): string {
  const photoCount = uploaded.filter((item) => item.kind === 'image').length;
  const videoCount = uploaded.length - photoCount;
  if (photoCount > 0 && videoCount > 0) {
    return `사진 ${uploaded.length}장을 업로드했어요.`;
  }
  if (videoCount > 0) return `영상 ${videoCount}개를 업로드했어요.`;
  return `사진 ${photoCount}장을 업로드했어요.`;
}

type Overlay =
  | { k: 'download' }
  | { k: 'move' }
  | { k: 'folderCreate'; moveAfter?: boolean }
  | { k: 'folderRename' }
  | { k: 'folderDelete' }
  | { k: 'roomDelete' }
  | { k: 'deletePhotos'; ids: string[] }
  | { k: 'qr' }
  | { k: 'downloadFail'; count: number }
  | null;

type PopoverKind = { kind: 'menu' | 'share'; rect: DOMRect } | null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 권한이 없는 환경 대비
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function RoomScreen({
  room,
  me,
  onOpenSettings,
  onLeaveHome,
}: {
  room: Room;
  me: Me;
  onOpenSettings: () => void;
  onLeaveHome: () => void;
}) {
  const { toast } = useStore();
  const actions = useRoomActions(room.code);
  const desktop = useIsDesktop();
  const online = useOnline();
  const remaining = useRemaining(room.expiresAt);

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PhotoFilter>('all');
  const [overlay, setOverlay] = useState<Overlay>(null);
  /** 이번 닫기가 "확정"인지 표시 — 표시가 없으면 그냥 포기하고 닫은 것으로 봅니다 */
  const confirmed = useRef(false);
  const lastOverlay = useRef<Overlay>(null);
  const [popover, setPopover] = useState<PopoverKind>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [folderMovePending, setFolderMovePending] = useState<{
    folderId: string;
    photoIds: string[];
  } | null>(null);
  const [demo, setDemo] = useState({ open: false, failUpload: false, failDownload: false });
  const fileInput = useRef<HTMLInputElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const scrollTopTimer = useRef<number | null>(null);
  const warned = useRef(false);

  const isHost = room.hostId === me.id;
  const canUpload = room.uploadPolicy === 'everyone' || isHost;
  const activeFolder = room.folders.find((f) => f.id === activeFolderId) ?? null;

  /* ── 목록 ─────────────────────────────────────────── */
  const photos = useMemo(() => {
    const inFolder = activeFolderId
      ? room.photos.filter((p) => p.folderIds.includes(activeFolderId))
      : room.photos;
    const byFilter = inFolder.filter((p) => {
      if (filter === 'mine') return p.uploaderId === me.id;
      if (filter === 'others') return p.uploaderId !== me.id;
      return true;
    });
    return [...byFilter].sort((a, b) => b.createdAt - a.createdAt);
  }, [room.photos, activeFolderId, filter, me.id]);

  const orderedIds = useMemo(() => photos.map((p) => p.id), [photos]);
  const selection = useSelection(orderedIds);
  const selectedPhotos = useMemo(
    () => photos.filter((p) => selection.isSelected(p.id)),
    [photos, selection],
  );
  const countInFolder = useCallback(
    (folderId: string) => room.photos.filter((p) => p.folderIds.includes(folderId)).length,
    [room.photos],
  );
  const canDelete = useCallback(
    (photo: Photo) => isHost || photo.uploaderId === me.id,
    [isHost, me.id],
  );

  useEffect(() => {
    if (!folderMovePending) return;
    const reflected = folderMovePending.photoIds.every((id) =>
      room.photos.some(
        (photo) => photo.id === id && photo.folderIds.includes(folderMovePending.folderId),
      ),
    );
    if (reflected) setFolderMovePending(null);
  }, [folderMovePending, room.photos]);

  useEffect(
    () => () => {
      if (scrollTopTimer.current !== null) window.clearTimeout(scrollTopTimer.current);
    },
    [],
  );

  /** 시트·모달을 확정하고 닫을 때 씁니다. 그냥 `setOverlay(null)` 로 닫으면 포기로 기록됩니다. */
  const closeOverlay = useCallback((wasConfirmed = false) => {
    confirmed.current = wasConfirmed;
    setOverlay(null);
  }, []);

  /* ── 계측 ─────────────────────────────────────────── */
  /** 라우트는 `room` 하나지만 사용자 시간의 대부분이 이 안에서 흐릅니다.
   * 체류시간이 의미를 가지려면 방 안을 이만큼 쪼개야 합니다. */
  const isEmpty = photos.length === 0;
  const emptySuffix = isEmpty ? '.empty' : '';
  const subScreen = lightboxId
    ? 'room.lightbox'
    : overlay
      ? `room.${overlay.k}`
      : activeFolderId
        ? `room.folder${emptySuffix}`
        : filter !== 'all'
          ? `room.filter${emptySuffix}`
          : `room.gallery${emptySuffix}`;

  useEffect(() => {
    screen(subScreen);
  }, [subScreen]);

  /** Amplitude에는 다이얼로그를 뺀, 실제로 탐색 가능한 화면만 남깁니다.
   * (컨벤션 2-4: 의미 있는 행동만 추적 — 시트/모달은 노이즈가 큽니다) */
  const roomScreenName = lightboxId
    ? 'lightbox'
    : overlay
      ? null
      : activeFolderId
        ? 'folder'
        : filter !== 'all'
          ? 'filter'
          : 'gallery';

  useEffect(() => {
    if (!roomScreenName) return;
    amplitude.track(AMPLITUDE_EVENTS.ROOM_SCREEN_VIEWED, {
      screen_name: roomScreenName,
      is_empty: isEmpty,
    });
  }, [roomScreenName, isEmpty]);

  /** 열었다가 그냥 닫은 시트·모달은 "여기 원하는 게 없었다"는 신호입니다.
   * 확정과 포기를 나눠 남깁니다. */
  useEffect(() => {
    const previous = lastOverlay.current;
    if (previous && previous.k !== overlay?.k) {
      action(confirmed.current ? 'dialog.confirmed' : 'dialog.dismissed', {
        dialog: previous.k,
        ...(overlay ? { to: overlay.k } : {}),
      });
      confirmed.current = false;
    }
    lastOverlay.current = overlay;
  }, [overlay]);

  /** 방이 실제로 어떻게 쓰이는지 — 폴더가 몇 개까지 늘어나는지, 멤버 중 몇 명이나
   * 실제로 올리는지가 다음에 만들 기능을 정해줍니다. 들어올 때와 나갈 때 한 번씩 남깁니다. */
  const roomShape = useRef({ photos: 0, folders: 0, members: 0, uploaders: 0, mine: 0 });
  roomShape.current = {
    photos: room.photos.length,
    folders: room.folders.length,
    members: room.members.length,
    uploaders: new Set(room.photos.map((p) => p.uploaderId)).size,
    mine: room.photos.filter((p) => p.uploaderId === me.id).length,
  };
  useEffect(() => {
    const mountedAt = Date.now();
    action('room.snapshot', { at: 'enter', ...roomShape.current });
    return () => {
      // StrictMode가 개발 중 효과를 두 번 실행하며 즉시 언마운트하는 것을 걸러냅니다
      if (Date.now() - mountedAt < 1000) return;
      action('room.snapshot', { at: 'leave', ...roomShape.current });
    };
  }, []);

  // 시나리오 칩으로 만든 실패는 전부 가짜 — 이 플래그가 없으면 실패율이 거짓말을 합니다
  useEffect(() => {
    setScenario(demo.failUpload || demo.failDownload);
  }, [demo.failUpload, demo.failDownload]);

  /* ── 업로드 ───────────────────────────────────────── */
  const upload = useUpload({
    me,
    roomCode: room.code,
    targetFolderId: activeFolderId,
    onPhotoUploaded: (photo) => {
      // Firebase 모드에서는 업로드가 이미 Firestore에 반영돼 구독으로 화면에 나타납니다.
      // 로컬 모드는 여기서 하나씩 갤러리에 반영해야, 배치 전체가 끝날 때까지
      // 기다리지 않고 사진이 하나씩 쌓이는 걸 볼 수 있습니다.
      if (!firebaseEnabled) actions.addPhotosLocal([photo]);
    },
    onUploaded: (uploaded) => {
      toast(uploadedMessage(uploaded));
    },
    shouldFail: useCallback(() => {
      if (!navigator.onLine) return '연결 끊김';
      if (demo.failUpload) return '네트워크 오류';
      return null;
    }, [demo.failUpload]),
  });

  /* ── 다운로드 ─────────────────────────────────────── */
  const download = useDownload({
    roomCode: room.code,
    onDone: (count) => toast(`사진 ${count}장을 다운로드했어요.`),
    onFail: (count) => setOverlay({ k: 'downloadFail', count }),
    shouldFail: useCallback(() => demo.failDownload, [demo.failDownload]),
  });
  const lastDownload = useRef<{ photos: Photo[]; mode: DownloadMode; toPhotos: boolean } | null>(
    null,
  );

  // 드래그가 창 밖에서 끝나면 dragleave가 오지 않아 안내가 남습니다
  useEffect(() => {
    const clear = () => setDropping(false);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  /* ── 만료 임박 안내 ───────────────────────────────── */
  useEffect(() => {
    if (warned.current) return;
    if (remaining > 0 && remaining <= 60 * 60 * 1000) {
      warned.current = true;
      toast('1시간 뒤에 방이 사라져요', 'warn');
    }
  }, [remaining, toast]);

  /* ── 동작 ─────────────────────────────────────────── */
  const pickFiles = () => fileInput.current?.click();

  const startDownload = (mode: DownloadMode, toPhotos: boolean) => {
    const targets = selectedPhotos.length > 0 ? selectedPhotos : [];
    if (targets.length === 0) return;
    closeOverlay(true);
    selection.setOutcome('download');
    selection.clear();
    lastDownload.current = { photos: targets, mode, toPhotos };
    action('download.start', { mode, count: targets.length, toPhotos, from: 'selection' });
    void download.start(targets, mode, toPhotos);
  };

  const downloadOne = (photo: Photo) => {
    // 모바일에서 앵커 다운로드는 사진첩이 아니라 파일 앱으로 들어갑니다.
    // 공유 시트를 쓸 수 있으면 그쪽으로 보내야 "사진첩에 저장"이 됩니다.
    const toPhotos = !desktop && canSaveToPhotos([photo]);
    lastDownload.current = { photos: [photo], mode: 'each', toPhotos };
    action('download.start', { mode: 'each', count: 1, toPhotos, from: 'lightbox' });
    void download.start([photo], 'each', toPhotos);
  };

  const removePhotos = (ids: string[], from: 'selection' | 'lightbox' = 'selection') => {
    ids.forEach((id) => void blobStore.del(id));
    actions.removePhotos(ids);
    selection.setOutcome('delete');
    selection.clear();
    closeOverlay(true);
    setLightboxId(null);
    action('photo.delete', { count: ids.length });
    amplitude.track(AMPLITUDE_EVENTS.PHOTO_DELETED, { count: ids.length, from });
    toast(`사진 ${ids.length}장을 삭제했어요.`);
  };

  const shareLink = async () => {
    setPopover(null);
    const ok = await copyText(inviteUrl(room.code, 'link'));
    action('invite.copy_link', { ok });
    amplitude.track(AMPLITUDE_EVENTS.INVITE_LINK_COPIED, { is_success: ok });
    toast(ok ? '공유 링크를 복사했어요.' : '링크 복사에 실패했어요.', ok ? 'success' : 'warn');
  };

  const copyCode = async () => {
    const ok = await copyText(room.code);
    action('invite.copy_code', { ok });
    amplitude.track(AMPLITUDE_EVENTS.INVITE_CODE_COPIED, { is_success: ok });
    closeOverlay(true);
    toast(ok ? '참여 코드를 복사했어요.' : '코드 복사에 실패했어요.', ok ? 'success' : 'warn');
  };

  const createFolder = (name: string, moveAfter?: boolean) => {
    const folder = { id: uid('f_'), name, createdAt: Date.now() };
    action('folder.create', { moveAfter: Boolean(moveAfter) });
    actions.addFolder(folder);
    closeOverlay(true);
    if (moveAfter && selectedPhotos.length > 0) {
      const ids = selectedPhotos.map((p) => p.id);
      setFolderMovePending({ folderId: folder.id, photoIds: ids });
      setFilter('all');
      actions.moveToFolder(ids, folder.id);
      selection.setOutcome('move');
      selection.clear();
      toast(`사진 ${selectedPhotos.length}장이 폴더에 추가되었어요.`);
    } else {
      toast('새 폴더를 만들었어요');
    }
    setActiveFolderId(folder.id);
  };

  const moveSelected = (folderId: string | null) => {
    const ids = selectedPhotos.map((p) => p.id);
    action('folder.move', { count: ids.length, out: !folderId });
    if (folderId) {
      setActiveFolderId(folderId);
      setFilter('all');
      setFolderMovePending({ folderId, photoIds: ids });
    }
    actions.moveToFolder(ids, folderId);
    selection.setOutcome('move');
    selection.clear();
    closeOverlay(true);
    toast(folderId ? `사진 ${ids.length}장이 폴더에 추가되었어요.` : '폴더에서 꺼냈어요.');
  };

  const deletableSelection = selectedPhotos.filter(canDelete);
  const lightboxIndex = lightboxId ? photos.findIndex((p) => p.id === lightboxId) : -1;
  const transfer = upload.transfer ?? download.transfer;

  /* ── 렌더 ─────────────────────────────────────────── */
  return (
    <div className="screen room-screen" data-empty={room.photos.length === 0}>
      <RoomHeader
        displayName={me.name || '나'}
        isHost={isHost}
        roomName={room.name}
        remaining={remaining}
        folders={room.folders}
        activeFolderId={activeFolderId}
        totalCount={room.photos.length}
        countInFolder={countInFolder}
        filter={filter}
        allSelected={photos.length > 0 && selection.count === photos.length}
        onSelectFolder={(id) => {
          setActiveFolderId(id);
          selection.setOutcome('switch');
          selection.clear();
        }}
        onAddFolder={() => setOverlay({ k: 'folderCreate' })}
        onChangeFilter={(next) => {
          action('filter', { value: next });
          setFilter(next);
          selection.setOutcome('switch');
          selection.clear();
        }}
        onToggleSelectAll={() =>
          selection.count === photos.length ? selection.clear() : selection.selectAll()
        }
        onOpenShare={(rect) => {
          action('popover.share');
          setPopover({ kind: 'share', rect });
        }}
        onOpenMenu={(rect) => {
          action('popover.menu');
          setPopover({ kind: 'menu', rect });
        }}
      />

      <div
        className="gallery-scroll"
        ref={galleryScrollRef}
        onScroll={(event) => {
          const visible = event.currentTarget.scrollTop > 240;
          setShowScrollTop(visible);
          if (scrollTopTimer.current !== null) window.clearTimeout(scrollTopTimer.current);
          if (visible) {
            scrollTopTimer.current = window.setTimeout(() => setShowScrollTop(false), 1600);
          }
        }}
        onDragOver={(event) => {
          if (!canUpload) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDropping(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDropping(false);
          if (!canUpload) return;
          void upload.addFiles(event.dataTransfer.files);
        }}
      >
        {dropping && (
          <div className="drop-hint">
            <MascotImage name="cheer" size={132} />
            여기에 놓으면 바로 올라가요
          </div>
        )}

        {folderMovePending?.folderId === activeFolderId ? (
          <div className="folder-loading" role="status" aria-label="폴더로 사진 이동 중">
            <span className="folder-loading__spinner" aria-hidden="true" />
          </div>
        ) : photos.length === 0 ? (
          <EmptyState
            folderName={activeFolder?.name}
            filter={filter}
            canUpload={canUpload}
            hasAny={room.photos.length > 0}
          />
        ) : (
          <Gallery
            photos={photos}
            meId={me.id}
            desktop={desktop}
            selection={selection}
            onOpen={setLightboxId}
          />
        )}
      </div>

      <button
        type="button"
        className="scroll-top"
        data-visible={showScrollTop}
        data-raised={selection.count > 0 || Boolean(transfer) || !online}
        aria-label="맨 위로"
        aria-hidden={!showScrollTop}
        tabIndex={showScrollTop ? 0 : -1}
        onClick={() => galleryScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <IconChevronUp size={14} />
      </button>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          if (event.target.files) void upload.addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {canUpload && selection.count === 0 && !transfer && (
        <button type="button" className="fab" data-raised={!online} onClick={pickFiles}>
          <IconPlus size={19} />
          올리기
        </button>
      )}

      {transfer ? (
        <TransferBar
          transfer={transfer}
          items={upload.items}
          elevated={lightboxIndex >= 0}
          onCancel={() => (upload.transfer ? upload.cancel() : download.cancel())}
        />
      ) : selection.count > 0 ? (
        <SelectionBar
          count={selection.count}
          canDelete={deletableSelection.length > 0}
          onClear={selection.clear}
          onDownload={() => setOverlay({ k: 'download' })}
          onDelete={() => setOverlay({ k: 'deletePhotos', ids: deletableSelection.map((p) => p.id) })}
          onMove={() => setOverlay({ k: 'move' })}
        />
      ) : null}

      {!online && !transfer && <NetworkBanner />}

      {SHOW_DEMO_SCENARIOS && !transfer && (
        <DemoPanel
          state={demo}
          raised={selection.count > 0 || !online}
          onChange={setDemo}
          onExpireSoon={() => actions.patchRoom({ expiresAt: Date.now() + 59 * 60 * 1000 })}
          onExpireNow={() => actions.patchRoom({ expiresAt: Date.now() - 1000 })}
        />
      )}

      {/* ── 팝오버 ── */}
      {popover?.kind === 'share' && (
        <Popover
          anchorRect={popover.rect}
          width={262}
          alignRight={30}
          onClose={() => setPopover(null)}
        >
          <PopoverItem icon={<IconLink size={20} />} onClick={shareLink}>
            링크 공유
            <small>앨범에 바로 참여하는 링크</small>
          </PopoverItem>
          <PopoverItem
            icon={<IconQr size={20} />}
            onClick={() => {
              setPopover(null);
              setOverlay({ k: 'qr' });
            }}
          >
            QR 및 코드 공유
            <small>휴대폰 카메라로 바로 접속</small>
          </PopoverItem>
        </Popover>
      )}

      {popover?.kind === 'menu' && (
        <Popover anchorRect={popover.rect} onClose={() => setPopover(null)}>
          <PopoverItem
            icon={<IconSliders size={20} />}
            disabled={!isHost}
            onClick={() => {
              setPopover(null);
              onOpenSettings();
            }}
          >
            방 설정
          </PopoverItem>
          <PopoverItem
            icon={<IconTrash size={20} />}
            data-tone="danger"
            disabled={!isHost}
            onClick={() => {
              setPopover(null);
              setOverlay({ k: 'roomDelete' });
            }}
          >
            방 삭제
          </PopoverItem>
          <PopoverSeparator />
          <PopoverItem
            icon={<IconFolderPlus size={20} />}
            onClick={() => {
              setPopover(null);
              setOverlay({ k: 'folderCreate' });
            }}
          >
            폴더 추가
          </PopoverItem>
          <PopoverItem
            icon={<IconFolderEdit size={20} />}
            disabled={!activeFolder}
            onClick={() => {
              setPopover(null);
              setOverlay({ k: 'folderRename' });
            }}
          >
            폴더 수정
          </PopoverItem>
          <PopoverItem
            icon={<IconFolderX size={20} />}
            disabled={!activeFolder}
            onClick={() => {
              setPopover(null);
              setOverlay({ k: 'folderDelete' });
            }}
          >
            폴더 삭제
          </PopoverItem>
        </Popover>
      )}

      {/* ── 시트 · 모달 ── */}
      {overlay?.k === 'download' && (
        <DownloadSheet
          count={selectedPhotos.length}
          roomCode={room.code}
          canSaveToPhotos={!desktop && canSaveToPhotos(selectedPhotos)}
          onClose={() => setOverlay(null)}
          onConfirm={startDownload}
        />
      )}

      {download.pendingShare && (
        <SaveToPhotosSheet
          count={download.pendingShare.count}
          onSave={() => void download.shareToPhotos()}
          onClose={download.dismissShare}
        />
      )}

      {overlay?.k === 'move' && (
        <MoveSheet
          count={selectedPhotos.length}
          folders={room.folders}
          countInFolder={countInFolder}
          currentFolderId={activeFolderId}
          onClose={() => setOverlay(null)}
          onMove={moveSelected}
          onCreateFolder={() => setOverlay({ k: 'folderCreate', moveAfter: true })}
        />
      )}

      {overlay?.k === 'folderCreate' && (
        <FolderSheet
          mode="create"
          taken={room.folders.map((f) => f.name)}
          onClose={() => setOverlay(null)}
          onSubmit={(name) => createFolder(name, overlay.moveAfter)}
        />
      )}

      {overlay?.k === 'folderRename' && activeFolder && (
        <FolderSheet
          mode="rename"
          initial={activeFolder.name}
          taken={room.folders.map((f) => f.name)}
          onClose={() => setOverlay(null)}
          onSubmit={(name) => {
            actions.renameFolder(activeFolder.id, name);
            closeOverlay(true);
            toast('폴더 이름을 변경했어요');
          }}
        />
      )}

      {overlay?.k === 'folderDelete' && activeFolder && (
        <DeleteFolderModal
          folderName={activeFolder.name}
          onClose={() => setOverlay(null)}
          onConfirm={() => {
            actions.deleteFolder(activeFolder.id);
            setActiveFolderId(null);
            closeOverlay(true);
            toast(`'${activeFolder.name}' 폴더를 삭제했어요`);
          }}
        />
      )}

      {overlay?.k === 'roomDelete' && (
        <DeleteRoomModal
          onClose={() => setOverlay(null)}
          onConfirm={() => {
            closeOverlay(true);
            amplitude.track(AMPLITUDE_EVENTS.ROOM_DELETED, { photo_count: room.photos.length });
            onLeaveHome();
          }}
        />
      )}

      {overlay?.k === 'deletePhotos' && (
        <DeletePhotosModal
          count={overlay.ids.length}
          onClose={() => setOverlay(null)}
          onConfirm={() => removePhotos(overlay.ids)}
        />
      )}

      {overlay?.k === 'qr' && (
        <QrModal
          code={room.code}
          url={inviteUrl(room.code, 'qr')}
          onCopyCode={copyCode}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.k === 'downloadFail' && (
        <DownloadFailModal
          count={overlay.count}
          onClose={() => setOverlay(null)}
          onRetry={() => {
            closeOverlay(true);
            const last = lastDownload.current;
            if (last) void download.start(last.photos, last.mode, last.toPhotos);
          }}
        />
      )}

      {upload.oversized.length > 0 && (
        <SizeLimitModal
          files={upload.oversized}
          onClose={() => {
            action('dialog.dismissed', { dialog: 'sizeLimit', files: upload.oversized.length });
            upload.clearOversized();
          }}
        />
      )}

      {upload.failures.length > 0 && (
        <UploadFailModal
          failures={upload.failures}
          onClose={() => {
            // 재시도하지 않고 닫음 = 포기. 재시도율과 함께 보면 실패 안내가 먹히는지 보입니다
            action('dialog.dismissed', { dialog: 'uploadFail', files: upload.failures.length });
            upload.clearFailures();
          }}
          onRetry={() => void upload.retryFailed()}
        />
      )}

      {/* ── 자세히 보기 ── */}
      {lightboxIndex >= 0 && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          desktop={desktop}
          selected={selection.isSelected(photos[lightboxIndex].id)}
          canDelete={canDelete(photos[lightboxIndex])}
          onIndexChange={(next) => setLightboxId(photos[next].id)}
          onToggleSelect={() => selection.toggle(photos[lightboxIndex].id)}
          onDelete={() => removePhotos([photos[lightboxIndex].id], 'lightbox')}
          onDownload={() => downloadOne(photos[lightboxIndex])}
          onClose={() => setLightboxId(null)}
        />
      )}
    </div>
  );
}

/* ── 빈 상태 ─────────────────────────────────────────── */

function EmptyState({
  folderName,
  filter,
  canUpload,
  hasAny,
}: {
  folderName?: string;
  filter: PhotoFilter;
  canUpload: boolean;
  hasAny: boolean;
}) {
  if (folderName) {
    return (
      <div className="empty empty--folder">
        <Mascot pose="peek" size={150} />
        <h2 className="empty__title">‘{folderName}’ 폴더가 비어있어요</h2>
        <p className="empty__desc">
          이 폴더는 비어있어요
          <br />첫 장을 올려서 채워보세요
        </p>
      </div>
    );
  }

  if (hasAny && filter !== 'all') {
    return (
      <div className="empty empty--folder">
        <Mascot pose="peek" size={150} />
        <h2 className="empty__title">
          {filter === 'mine' ? '내가 올린 사진이 없어요' : '다른 사람이 올린 사진이 없어요'}
        </h2>
        <p className="empty__desc">필터를 ‘전체’로 바꾸면 모두 볼 수 있어요</p>
      </div>
    );
  }

  return (
    <div className="empty empty--room">
      <MascotImage name="emptyRoom" size={230} />
      <h2 className="empty__title">아직 사진이 없어요</h2>
      <p className="empty__desc">
        {canUpload ? (
          <>
            첫 장을 올리면 여기에 쌓여요.
            <br />방이 사라지기 전까지 누구나 올릴 수 있어요.
          </>
        ) : (
          '방장만 올릴 수 있는 방이에요'
        )}
      </p>
    </div>
  );
}

/* ── 데모 시나리오 (프로토타입 확인용) ───────────────── */

interface DemoState {
  open: boolean;
  failUpload: boolean;
  failDownload: boolean;
}

function DemoPanel({
  state,
  raised,
  onChange,
  onExpireSoon,
  onExpireNow,
}: {
  state: DemoState;
  raised: boolean;
  onChange: (next: DemoState) => void;
  onExpireSoon: () => void;
  onExpireNow: () => void;
}) {
  return (
    <>
      {state.open && (
        <div className="demo-panel" data-raised={raised}>
          <h3>프로토타입 시나리오</h3>
          <button
            type="button"
            data-on={state.failUpload}
            onClick={() => onChange({ ...state, failUpload: !state.failUpload })}
          >
            업로드 실패 유발 {state.failUpload ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            data-on={state.failDownload}
            onClick={() => onChange({ ...state, failDownload: !state.failDownload })}
          >
            다운로드 실패 유발 {state.failDownload ? 'ON' : 'OFF'}
          </button>
          <button type="button" onClick={onExpireSoon}>
            만료 1시간 전으로
          </button>
          <button type="button" onClick={onExpireNow}>
            지금 만료시키기
          </button>
        </div>
      )}
      <button
        type="button"
        className="demo-toggle"
        data-raised={raised}
        onClick={() => onChange({ ...state, open: !state.open })}
      >
        시나리오
      </button>
    </>
  );
}

export { NameSheet };
