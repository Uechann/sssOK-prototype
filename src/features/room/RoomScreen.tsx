import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Photo, PhotoFilter, Room } from '../../types';
import { useStore, useRoomActions, type Me } from '../../store/store';
import { useIsDesktop, useOnline, useRemaining } from '../../lib/hooks';
import { inviteUrl } from '../../lib/router';
import { uid } from '../../lib/format';
import { blobStore } from '../../lib/idb';
import { Mascot, MascotImage } from '../../components/Mascot';
import { firebaseEnabled } from '../../lib/firebase';
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
  SizeLimitModal,
  UploadFailModal,
} from './dialogs';
import { useSelection } from './useSelection';
import { useUpload } from './useUpload';
import { canSaveToPhotos, useDownload, type DownloadMode } from './useDownload';
import './room.css';

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

  /* ── 업로드 ───────────────────────────────────────── */
  const upload = useUpload({
    me,
    roomCode: room.code,
    targetFolderId: activeFolderId,
    onUploaded: (uploaded) => {
      // Firebase 모드에서는 업로드가 이미 Firestore에 반영돼 구독으로 화면에 나타납니다.
      if (!firebaseEnabled) actions.addPhotosLocal(uploaded);
      toast(`사진 ${uploaded.length}장을 업로드했어요.`);
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
    setOverlay(null);
    selection.clear();
    lastDownload.current = { photos: targets, mode, toPhotos };
    void download.start(targets, mode, toPhotos);
  };

  const downloadOne = (photo: Photo) => {
    lastDownload.current = { photos: [photo], mode: 'each', toPhotos: false };
    void download.start([photo], 'each', false);
  };

  const removePhotos = (ids: string[]) => {
    ids.forEach((id) => void blobStore.del(id));
    actions.removePhotos(ids);
    selection.clear();
    setOverlay(null);
    setLightboxId(null);
    toast(`사진 ${ids.length}장을 삭제했어요.`);
  };

  const shareLink = async () => {
    setPopover(null);
    const ok = await copyText(inviteUrl(room.code));
    toast(ok ? '공유 링크를 복사했어요.' : '링크 복사에 실패했어요.', ok ? 'success' : 'warn');
  };

  const copyCode = async () => {
    const ok = await copyText(room.code);
    setOverlay(null);
    toast(ok ? '참여 코드를 복사했어요.' : '코드 복사에 실패했어요.', ok ? 'success' : 'warn');
  };

  const createFolder = (name: string, moveAfter?: boolean) => {
    const folder = { id: uid('f_'), name, createdAt: Date.now() };
    actions.addFolder(folder);
    setOverlay(null);
    if (moveAfter && selectedPhotos.length > 0) {
      const ids = selectedPhotos.map((p) => p.id);
      setFolderMovePending({ folderId: folder.id, photoIds: ids });
      setFilter('all');
      actions.moveToFolder(ids, folder.id);
      selection.clear();
      toast(`사진 ${selectedPhotos.length}장이 폴더에 추가되었어요.`);
    } else {
      toast('새 폴더를 만들었어요');
    }
    setActiveFolderId(folder.id);
  };

  const moveSelected = (folderId: string | null) => {
    const ids = selectedPhotos.map((p) => p.id);
    if (folderId) {
      setActiveFolderId(folderId);
      setFilter('all');
      setFolderMovePending({ folderId, photoIds: ids });
    }
    actions.moveToFolder(ids, folderId);
    selection.clear();
    setOverlay(null);
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
          selection.clear();
        }}
        onAddFolder={() => setOverlay({ k: 'folderCreate' })}
        onChangeFilter={(next) => {
          setFilter(next);
          selection.clear();
        }}
        onToggleSelectAll={() =>
          selection.count === photos.length ? selection.clear() : selection.selectAll()
        }
        onOpenShare={(rect) => setPopover({ kind: 'share', rect })}
        onOpenMenu={(rect) => setPopover({ kind: 'menu', rect })}
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

      {!transfer && (
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
            setOverlay(null);
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
            setOverlay(null);
            toast(`'${activeFolder.name}' 폴더를 삭제했어요`);
          }}
        />
      )}

      {overlay?.k === 'roomDelete' && (
        <DeleteRoomModal
          onClose={() => setOverlay(null)}
          onConfirm={() => {
            setOverlay(null);
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
          url={inviteUrl(room.code)}
          onCopyCode={copyCode}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.k === 'downloadFail' && (
        <DownloadFailModal
          count={overlay.count}
          onClose={() => setOverlay(null)}
          onRetry={() => {
            setOverlay(null);
            const last = lastDownload.current;
            if (last) void download.start(last.photos, last.mode, last.toPhotos);
          }}
        />
      )}

      {upload.oversized.length > 0 && (
        <SizeLimitModal files={upload.oversized} onClose={upload.clearOversized} />
      )}

      {upload.failures.length > 0 && (
        <UploadFailModal
          failures={upload.failures}
          onClose={upload.clearFailures}
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
          onDelete={() => removePhotos([photos[lightboxIndex].id])}
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
