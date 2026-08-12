import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { Folder, Photo, UploadItem } from '../../types';
import { Mascot, MascotImage } from '../../components/Mascot';
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
  const trimmed = name.trim();

  return (
    <Sheet
      title="표시할 이름을 입력해주세요"
      desc="입력한 이름은 다른 사람에게 보여요"
      grabber={false}
      dismissible={Boolean(onClose)}
      onClose={() => onClose?.()}
    >
      <TextField
        placeholder="이름을 입력하세요"
        value={name}
        maxLength={NAME_MAX}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && trimmed) onSubmit(trimmed);
        }}
      />
      <Button
        style={{ marginTop: 8 }}
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
    <Sheet title={`${count}개를 어떻게 받을까요?`} onClose={onClose}>
      <div className="sheet__art">
        <MascotImage name="sorted" size={128} />
      </div>
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
            <span className="option__sub">공유 시트로 바로 저장해요</span>
          </span>
          {toPhotos && (
            <span className="option__mark">
              <IconCheck size={13} />
            </span>
          )}
        </button>
      )}

      <p className="hint" style={{ marginBottom: 16 }}>
        업로드 당시 원본 파일명을 그대로 유지해요
      </p>
      <Button onClick={() => onConfirm(mode, toPhotos)}>다운로드</Button>
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
    >
      <div className="sheet__art">
        <MascotImage name="thumbsUp" size={122} />
      </div>
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

      <p className="hint" style={{ marginBottom: 16 }}>
        사진은 여러 폴더에 함께 담을 수 있어요.
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        <Button disabled={picked === null} onClick={() => onMove(picked)}>
          여기로 이동
        </Button>
        {currentFolderId && (
          <Button variant="secondary" onClick={() => onMove(null)}>
            폴더에서 꺼내기
          </Button>
        )}
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
  const trimmed = name.trim();
  const duplicated = trimmed !== initial && taken.includes(trimmed);
  const tooLong = name.length >= NAME_MAX;
  const error = duplicated
    ? '같은 이름의 폴더가 있어요'
    : tooLong
      ? '폴더 이름을 확인해주세요'
      : null;
  const valid = trimmed.length > 0 && !duplicated && !tooLong;

  return (
    <Sheet title={mode === 'create' ? '새 폴더 만들기' : '폴더 이름 수정'} onClose={onClose}>
      <TextField
        label={mode === 'create' ? '폴더 이름' : '새 폴더 이름'}
        placeholder="폴더 이름을 입력하세요"
        value={name}
        maxLength={NAME_MAX}
        error={error}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && valid) onSubmit(trimmed);
        }}
      />
      <Button style={{ marginTop: 8 }} disabled={!valid} onClick={() => onSubmit(trimmed)}>
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
      art={<Mascot pose="alert" size={170} />}
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
      art={<Mascot pose="trash" size={175} />}
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
      art={<Mascot pose="folderX" size={180} />}
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
      art={<Mascot pose="sad" size={165} />}
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
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={onRetry}>실패만 재시도</Button>
        </>
      }
    >
      <div className="fail-list">
        {failures.slice(0, 5).map((item) => (
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
      art={<Mascot pose="sad" size={165} />}
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
      <div style={{ marginTop: 18 }}>
        {files.slice(0, 4).map((file) => (
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
        {files.length > 4 && <p className="hint">외 {files.length - 4}개</p>}
      </div>
      <div className="limit-chips">
        <span className="limit-chip">🖼️ 이미지 ~10MB</span>
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

  const pretty = useMemo(() => code.split('').join(' '), [code]);

  return (
    <Modal align="left" title="QR 또는 코드로 참여" onClose={onClose}>
      <div className="qr-card">
        {dataUrl ? <img src={dataUrl} alt={`${code} 참여 QR 코드`} /> : <div style={{ height: 210 }} />}
      </div>
      <p className="field__label">참여 코드</p>
      <button type="button" className="code-copy" onClick={onCopyCode}>
        <span className="code-copy__value">{pretty}</span>
        <span className="code-copy__action">
          <IconCopy size={17} />
          복사
        </span>
      </button>
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
