import { useState } from 'react';
import type { ExpiryHours, UploadPolicy } from '../types';
import { Mascot } from '../components/Mascot';
import { MenuButton, Segment, TextField, TopBar } from '../components/ui';
import './entry.css';

export interface RoomFormValue {
  name: string;
  uploadPolicy: UploadPolicy;
  /** 만료까지 남길 시간(시간 단위) */
  expiryHours: ExpiryHours;
  passcode: string;
}

export const EXPIRY_OPTIONS: ExpiryHours[] = [24, 72];
const NAME_MAX = 20;

export function RoomForm({
  mode,
  initial,
  onBack,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial: RoomFormValue;
  onBack: () => void;
  onSubmit: (value: RoomFormValue) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [uploadPolicy, setUploadPolicy] = useState<UploadPolicy>(initial.uploadPolicy);
  const [expiryHours, setExpiryHours] = useState<ExpiryHours>(initial.expiryHours);
  const [touched, setTouched] = useState(false);
  const [limitError, setLimitError] = useState(false);

  const trimmed = name.trim();
  const nameError = touched && trimmed.length === 0 ? '방 이름을 입력해주세요' : null;
  const displayedNameError = limitError ? '방 이름은 20자까지 입력할 수 있어요' : nameError;
  const valid = trimmed.length > 0;

  const submit = () => {
    setTouched(true);
    if (trimmed.length === 0) return;
    onSubmit({
      name: trimmed,
      uploadPolicy,
      expiryHours,
      passcode: initial.passcode,
    });
  };

  return (
    <div className="screen">
      <TopBar title={mode === 'create' ? '방 만들기' : '방 설정 변경하기'} onBack={onBack} />
      <div className="form-screen">
        <div className="form-screen__scroll" data-mode={mode}>
          <div className="form-block">
            <TextField
              label="방 이름"
              placeholder="예) 제주 여행"
              value={name}
              maxLength={NAME_MAX}
              error={displayedNameError}
              onBeforeInput={(event) => {
                const input = event.nativeEvent as InputEvent;
                if (name.length >= NAME_MAX && input.data) {
                  event.preventDefault();
                  setLimitError(true);
                }
              }}
              onPaste={(event) => {
                const input = event.currentTarget;
                const selectedLength = (input.selectionEnd ?? name.length) - (input.selectionStart ?? name.length);
                const pastedLength = event.clipboardData.getData('text').length;
                if (name.length - selectedLength + pastedLength > NAME_MAX) setLimitError(true);
              }}
              onChange={(event) => {
                const next = event.target.value;
                setName(next.slice(0, NAME_MAX));
                if (next.length < NAME_MAX) setLimitError(false);
              }}
              onKeyDown={(event) => {
                if (name.length >= NAME_MAX && event.key.length === 1) setLimitError(true);
                if (event.key === 'Enter' && trimmed) submit();
              }}
            />
          </div>

          <div className="form-block">
            <span className="form-block__label">업로드 권한</span>
            <Segment<UploadPolicy>
              value={uploadPolicy}
              onChange={setUploadPolicy}
              options={[
                { value: 'everyone', label: '누구나' },
                { value: 'host', label: '방장만' },
              ]}
            />
          </div>

          <div className="form-block">
            <span className="form-block__label">방 만료 시간</span>
            <Segment<ExpiryHours>
              value={expiryHours}
              onChange={setExpiryHours}
              options={[
                { value: 24, label: '1일' },
                { value: 72, label: '3일' },
              ]}
            />
          </div>

          <div className="form-screen__art form-screen__art--create">
            <Mascot pose="wave" size={145} />
          </div>
        </div>

        <div className="form-screen__footer">
          <MenuButton onClick={submit} disabled={!valid}>
            {mode === 'create' ? '방 만들기' : '변경 사항 저장'}
          </MenuButton>
        </div>
      </div>
    </div>
  );
}
