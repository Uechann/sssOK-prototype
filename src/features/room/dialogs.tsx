import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Folder, Photo, UploadItem } from '../../types';
import { MascotImage } from '../../components/Mascot';
import { Button, Modal, Sheet, TextField } from '../../components/ui';
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFile,
  IconFolder,
} from '../../components/Icons';
import { formatBytes } from '../../lib/format';
import type { OversizedFile } from './useUpload';
import type { DownloadMode } from './useDownload';
import './room.css';

const NAME_MAX = 12;

/* 02-1 · 표시할 이름 입력 (최초 1회) */
export function NameSheet({
  initial = '',
  onSubmit,
  onClose,
}: {
  initial?: string;
  onSubmit: (name: string) => void;
  onClose?: () => void;
}) {
  const [name, setName] = useState(initial);
  const [limitError, setLimitError] = useState(false);
  const trimmed = name.trim();

  return (
    <Sheet
      title="표시할 이름을 입력해주세요"
      grabber={false}
      dismissible={Boolean(onClose)}
      onClose={() => onClose?.()}
      className="name-sheet"
    >
      <TextField
        label="입력한 이름은 다른 사람에게 보여요"
        placeholder="이름을 입력하세요"
        value={name}
        maxLength={NAME_MAX}
        error={limitError ? '이름은 12자까지 입력할 수 있어요' : null}
        autoFocus
        onBeforeInput={(event) => {
          const input = event.nativeEvent as InputEvent;
          if (name.length >= NAME_MAX && input.data) {
            event.preventDefault();
            setLimitError(true);
          }
        }}
        onChange={(event) => {
          const next = event.target.value;
          setName(next.slice(0, NAME_MAX));
          setLimitError(next.length > NAME_MAX);
        }}
        onKeyDown={(event) => {
          if (name.length >= NAME_MAX && event.key.length === 1) setLimitError(true);
          if (event.key === 'Enter' && trimmed) onSubmit(trimmed);
        }}
      />
      <Button
        className="name-sheet__button"
        disabled={trimmed.length === 0}
        onClick={() => onSubmit(trimmed)}
      >
        입장하기
      </Button>
    </Sheet>
  );
}

/* 06-1 · 다운로드 방식 선택 */
export function DownloadSheet({
  count,
  roomCode,
  canSaveToPhotos,
  onClose,
  onConfirm,
}: {
  count: number;
  roomCode: string;
  canSaveToPhotos: boolean;
  onClose: () => void;
  onConfirm: (mode: DownloadMode, toPhotoLibrary: boolean) => void;
}) {
  const [mode, setMode] = useState<DownloadMode>(count > 1 ? 'zip' : 'each');
  const [toPhotos, setToPhotos] = useState(false);

  return (
    <Sheet title={`${count}개를 어떻게 받을까요?`} onClose={onClose} className="download-sheet">
      <button
        type="button"
        className="option"
        aria-pressed={mode === 'each' && !toPhotos}
        onClick={() => {
          setMode('each');
          setToPhotos(false);
        }}
      >
        <span className="option__icon">
          <IconDownload size={20} />
        </span>
        <span className="option__body">
          <span className="option__name">개별로 저장</span>
          <span className="option__sub">한 장씩 원본 그대로</span>
        </span>
        {mode === 'each' && !toPhotos && (
          <span className="option__mark">
            <IconCheck size={13} />
          </span>
        )}
      </button>

      <button
        type="button"
        className="option"
        aria-pressed={mode === 'zip' && !toPhotos}
        onClick={() => {
          setMode('zip');
          setToPhotos(false);
        }}
      >
        <span className="option__icon">
          <IconFile size={20} />
        </span>
        <span className="option__body">
          <span className="option__name">.zip 일괄 다운로드</span>
          <span className="option__sub">sssOK_{roomCode}.zip</span>
        </span>
        {mode === 'zip' && !toPhotos && (
          <span className="option__mark">
            <IconCheck size={13} />
          </span>
        )}
      </button>

      {canSaveToPhotos && (
        <button
          type="button"
          className="option"
          aria-pressed={toPhotos}
          onClick={() => setToPhotos(true)}
        >
          <span className="option__icon">
            <IconCheck size={20} />
          </span>
          <span className="option__body">
            <span className="option__name">사진첩에 저장</span>
            <span className="option__sub">받은 뒤 공유 시트로 저장해요</span>
          </span>
          {toPhotos && (
            <span className="option__mark">
              <IconCheck size={13} />
            </span>
          )}
        </button>
      )}

      <p className="hint download-sheet__hint">
        업로드 당시 원본 파일명을 그대로 유지해요
      </p>
      <Button className="download-sheet__button" onClick={() => onConfirm(mode, toPhotos)}>
        다운로드
      </Button>
    </Sheet>
  );
}

/* 06-2 · 사진첩 저장 확인 — 공유 시트를 여는 마지막 한 번의 탭
 *
 * 사진을 다 받은 뒤 곧바로 navigator.share를 부르면 안 됩니다. 그건 사용자가 방금
 * 누른 직후에만 열리는데, 받는 동안 그 자격이 만료되기 때문입니다(Android는
 * NotAllowedError, iOS는 시트가 안 뜨거나 저장 실패). 이 버튼의 onClick에서 부르면
 * 항상 유효합니다. */
export function SaveToPhotosSheet({
  count,
  onSave,
  onClose,
}: {
  count: number;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={`${count}장을 사진첩에 저장할까요?`} onClose={onClose} className="download-sheet">
      <p className="hint download-sheet__hint">
        다 받았어요. 아래를 누르면 공유 시트가 열려요 —
        iPhone은 <b>이미지 저장</b>, Android는 <b>사진</b> 앱을 고르면 사진첩에 담깁니다.
      </p>
      <Button className="download-sheet__button" onClick={onSave}>
        사진첩에 저장
      </Button>
    </Sheet>
  );
}

/* 13-1 · 폴더 이동 모달 */
export function MoveSheet({
  count,
  folders,
  countInFolder,
  currentFolderId,
  onClose,
  onMove,
  onCreateFolder,
}: {
  count: number;
  folders: Folder[];
  countInFolder: (id: string) => number;
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
  onCreateFolder: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <Sheet
      title={`${count}개를 어디로 옮길까요?`}
      trailing={<span className="t-caption muted">선택됨 {count}</span>}
      onClose={onClose}
      className="download-sheet move-sheet"
    >
      {folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          className="option"
          aria-pressed={picked === folder.id}
          onClick={() => setPicked(folder.id)}
        >
          <span style={{ color: picked === folder.id ? 'var(--orange)' : 'var(--gray-500)' }}>
            <IconFolder size={22} />
          </span>
          <span className="option__body">
            <span className="option__name">{folder.name}</span>
          </span>
          {picked === folder.id ? (
            <span className="option__mark">
              <IconCheck size={13} />
            </span>
          ) : (
            <span className="option__count">{countInFolder(folder.id)}</span>
          )}
        </button>
      ))}

      <button type="button" className="option" onClick={onCreateFolder}>
        <span style={{ color: 'var(--gray-500)' }}>
          <IconFolder size={22} />
        </span>
        <span className="option__body">
          <span className="option__name">새 폴더 만들어 옮기기</span>
        </span>
      </button>

      <p className="hint download-sheet__hint">
        사진은 여러 폴더에 함께 담을 수 있어요.
      </p>

      <div className="move-sheet__actions">
        {currentFolderId && (
          <Button variant="secondary" onClick={() => onMove(null)}>
            폴더에서 꺼내기
          </Button>
        )}
        <Button disabled={picked === null} onClick={() => onMove(picked)}>
          여기로 이동
        </Button>
      </div>
    </Sheet>
  );
}

/* 11-1 · 새 폴더 만들기 / 12-1 · 폴더 이름 수정 */
export function FolderSheet({
  mode,
  initial = '',
  taken,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'rename';
  initial?: string;
  taken: string[];
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [limitError, setLimitError] = useState(false);
  const trimmed = name.trim();
  const duplicated = trimmed !== initial && taken.includes(trimmed);
  const error = duplicated
    ? '같은 이름의 폴더가 있어요'
    : limitError
      ? '폴더 이름을 확인해주세요'
      : null;
  const valid = trimmed.length > 0 && !duplicated;

  return (
    <Sheet
      title={mode === 'create' ? '새 폴더 만들기' : '폴더 이름 수정'}
      onClose={onClose}
      className="folder-name-sheet"
    >
      <TextField
        label={mode === 'create' ? '폴더 이름' : '새 폴더 이름'}
        placeholder="폴더 이름을 입력하세요"
        value={name}
        maxLength={NAME_MAX}
        error={error}
        onBeforeInput={(event) => {
          const input = event.nativeEvent as InputEvent;
          if (name.length >= NAME_MAX && input.data) {
            event.preventDefault();
            setLimitError(true);
          }
        }}
        onChange={(event) => {
          const next = event.target.value;
          setName(next.slice(0, NAME_MAX));
          setLimitError(next.length > NAME_MAX);
        }}
        onKeyDown={(event) => {
          if (name.length >= NAME_MAX && event.key.length === 1) setLimitError(true);
          if (event.key === 'Enter' && valid) onSubmit(trimmed);
        }}
      />
      <Button className="folder-name-sheet__button" disabled={!valid} onClick={() => onSubmit(trimmed)}>
        {mode === 'create' ? '만들기' : '수정하기'}
      </Button>
    </Sheet>
  );
}

/* 10-1 · 방 삭제 */
export function DeleteRoomModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      className="delete-room-modal"
      art={<MascotImage name="alert" size={105} />}
      title="방을 삭제할까요?"
      desc={
        <>
          삭제한 방과 사진은
          <br />
          다시 복구할 수 없어요.
        </>
      }
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            삭제
          </Button>
        </>
      }
    />
  );
}

/* 05-1 · 사진 삭제 */
export function DeletePhotosModal({
  count,
  onClose,
  onConfirm,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      className="delete-photos-modal"
      art={<MascotImage name="trash" size={105} />}
      title={`사진 ${count}장을 삭제할까요?`}
      desc={
        <>
          삭제한 사진은
          <br />
          모든 폴더에서 함께 삭제돼요.
        </>
      }
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            삭제
          </Button>
        </>
      }
    />
  );
}

/* 12-1 · 폴더 삭제 */
export function DeleteFolderModal({
  folderName,
  onClose,
  onConfirm,
}: {
  folderName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      className="delete-folder-modal"
      art={<MascotImage name="folderDelete" size={105} />}
      title={`'${folderName}' 폴더를 삭제할까요?`}
      desc={
        <>
          폴더만 삭제되고,
          <br />
          사진은 그대로 유지돼요.
        </>
      }
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            취소
          </Button>
          <Button onClick={onConfirm}>삭제</Button>
        </>
      }
    />
  );
}

/* 07g · 업로드 실패 — 파일별 사유 + 실패만 재시도 */
export function UploadFailModal({
  failures,
  onClose,
  onRetry,
}: {
  failures: UploadItem[];
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal
      className="upload-fail-modal"
      art={<MascotImage name="downloadFail" size={105} />}
      title={`앗, ${failures.length}장을 못 올렸어요`}
      desc={
        <>
          네트워크가 끊겼거나 예기치 못한 실수로 실패했어요.
          <br />
          실패한 파일만 다시 시도해보세요!
        </>
      }
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={onRetry}>실패만 재시도</Button>
        </>
      }
    >
      <div className="fail-list" tabIndex={0} aria-label="업로드에 실패한 파일 목록">
        {failures.map((item) => (
          <div className="fail-row" key={item.id}>
            <span className="fail-row__name">{item.name}</span>
            <span className="fail-row__reason">{item.error}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* 12-1 · 다운로드 실패 */
export function DownloadFailModal({
  count,
  onClose,
  onRetry,
}: {
  count: number;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal
      className="download-fail-modal"
      art={<MascotImage name="downloadFail" size={105} />}
      title={`앗, ${count}장을 못받았어요`}
      desc={
        <>
          예기치 못한 이유로 다운로드에 실패했어요
          <br />
          다시 시도해주세요.
        </>
      }
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={onRetry}>재시도</Button>
        </>
      }
    />
  );
}

/* 07d · 용량 제한 안내 */
export function SizeLimitModal({
  files,
  onClose,
}: {
  files: OversizedFile[];
  onClose: () => void;
}) {
  return (
    <Modal
      align="left"
      titleIcon={
        <span className="modal__title-icon">
          <IconAlert size={21} />
        </span>
      }
      title="파일이 너무 커요"
      hideClose
      onClose={onClose}
      actions={<Button onClick={onClose}>확인</Button>}
    >
      <div className="size-list" tabIndex={0} aria-label="용량을 초과한 파일 목록">
        {files.map((file) => (
          <div className="size-row" key={file.name}>
            <span className="size-row__thumb">
              <IconFile size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="size-row__name">
                {file.name} · {formatBytes(file.size)}
              </p>
              <p className="size-row__reason">{file.reason}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="limit-chips">
        <span className="limit-chip">🖼️ 이미지 ~30MB</span>
        <span className="limit-chip">🎬 영상 ~1GB</span>
      </div>
    </Modal>
  );
}

/* 14-1 · QR 및 코드 공유 */
export function QrModal({
  code,
  url,
  onCopyCode,
  onClose,
}: {
  code: string;
  url: string;
  onCopyCode: () => void;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 480,
      color: { dark: '#1A1A1A', light: '#FFFFFF' },
    }).then((result) => {
      if (alive) setDataUrl(result);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <Modal className="qr-modal" align="left" title="QR 또는 코드로 참여" onClose={onClose}>
      <div className="qr-card">
        {dataUrl ? <img src={dataUrl} alt={`${code} 참여 QR 코드`} /> : <div style={{ height: 210 }} />}
      </div>
      <div className="qr-modal__code">
        <p className="field__label">참여 코드</p>
        <button type="button" className="code-copy" onClick={onCopyCode}>
          <span className="code-copy__value">{code}</span>
          <span className="code-copy__action">
            <IconCopy size={17} />
            복사
          </span>
        </button>
      </div>
    </Modal>
  );
}

/* 사진 상세 정보가 필요 없을 때 쓰는 간단 확인 모달 */
export function ConfirmModal({
  title,
  desc,
  confirmLabel,
  tone = 'primary',
  onClose,
  onConfirm,
  photo,
}: {
  title: string;
  desc?: React.ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onClose: () => void;
  onConfirm: () => void;
  photo?: Photo;
}) {
  return (
    <Modal
      title={title}
      desc={desc}
      art={photo ? <img src={photo.poster} alt="" width={120} style={{ borderRadius: 12 }} /> : undefined}
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            취소
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
