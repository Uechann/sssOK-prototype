import { useState } from 'react';
import type { UploadPolicy } from '../types';
import { Mascot } from '../components/Mascot';
import { Button, Segment, Switch, TextField, TopBar } from '../components/ui';
import { IconChevronDown } from '../components/Icons';
import './entry.css';

export interface RoomFormValue {
  name: string;
  uploadPolicy: UploadPolicy;
  /** 만료까지 남길 시간(시간 단위) */
  expiryHours: number;
  passcode: string;
}

export const EXPIRY_OPTIONS = [6, 12, 24];
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
  const [expiryHours, setExpiryHours] = useState(initial.expiryHours);
  const [passcodeOn, setPasscodeOn] = useState(Boolean(initial.passcode));
  const [passcode, setPasscode] = useState(initial.passcode);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const nameError = touched && trimmed.length === 0 ? '방 이름을 입력해주세요' : null;
  const passcodeError =
    passcodeOn && touched && passcode.trim().length > 0 && passcode.trim().length < 4
      ? '암호는 4자 이상으로 정해주세요'
      : null;
  const valid = trimmed.length > 0 && !passcodeError;

  const submit = () => {
    setTouched(true);
    if (trimmed.length === 0) return;
    if (passcodeOn && passcode.trim().length > 0 && passcode.trim().length < 4) return;
    onSubmit({
      name: trimmed,
      uploadPolicy,
      expiryHours,
      passcode: passcodeOn ? passcode.trim() : '',
    });
  };

  return (
    <div className="screen">
      <TopBar title={mode === 'create' ? '방 만들기' : '방 설정 변경하기'} onBack={onBack} />
      <div className="form-screen">
        <div className="form-screen__scroll">
          <div className="form-screen__art">
            <Mascot pose="photo" size={196} />
          </div>

          <div className="form-block">
            <TextField
              label="방 이름"
              placeholder="예) 제주 여행"
              value={name}
              maxLength={NAME_MAX}
              error={nameError}
              onChange={(event) => setName(event.target.value)}
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

          <button
            type="button"
            className="disclosure"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
          >
            추가 설정
            <span className="disclosure__caret" style={{ display: 'inline-flex' }}>
              <IconChevronDown size={20} />
            </span>
          </button>

          {open && (
            <>
              <div className="form-block">
                <span className="form-block__label">
                  {mode === 'create' ? '만료 시간' : '만료 시간 (지금부터 다시 계산돼요)'}
                </span>
                <div className="expiry-grid">
                  {EXPIRY_OPTIONS.map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      className="segment__item"
                      aria-pressed={expiryHours === hours}
                      onClick={() => setExpiryHours(hours)}
                    >
                      {hours}시간
                    </button>
                  ))}
                </div>
                <p className="hint">시간이 지나면 사진과 영상이 자동으로 삭제돼요.</p>
              </div>

              <div className="form-block">
                <div className="switch-row">
                  <div>
                    <span className="form-block__label" style={{ marginBottom: 2 }}>
                      입장 암호
                    </span>
                    <p className="hint" style={{ marginTop: 0 }}>
                      선택 사항이에요. 켜두면 코드와 암호를 함께 입력해야 들어와요.
                    </p>
                  </div>
                  <Switch checked={passcodeOn} onChange={setPasscodeOn} label="입장 암호 사용" />
                </div>
                {passcodeOn && (
                  <TextField
                    placeholder="4자 이상"
                    value={passcode}
                    maxLength={12}
                    error={passcodeError}
                    onChange={(event) => setPasscode(event.target.value)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div className="form-screen__footer">
          <Button onClick={submit} disabled={touched && !valid}>
            {mode === 'create' ? '방 만들기' : '변경 사항 저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
