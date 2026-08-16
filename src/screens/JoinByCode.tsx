import { useEffect, useRef, useState } from 'react';
import { MenuButton, TextField, TopBar } from '../components/ui';
import './entry.css';

const CODE_LENGTH = 8;

export interface JoinAttempt {
  code: string;
  passcode: string;
}

export function JoinByCode({
  initialCode = '',
  onBack,
  /** 코드가 맞으면 null, 틀리면 표시할 오류 메시지를 반환합니다 */
  onSubmit,
  /** 암호가 걸린 방인지 확인 */
  needsPasscode,
}: {
  initialCode?: string;
  onBack: () => void;
  onSubmit: (attempt: JoinAttempt) => Promise<string | null>;
  needsPasscode: (code: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState(initialCode.toUpperCase().slice(0, CODE_LENGTH));
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hot, setHot] = useState(false); // 방금 입력한 칸을 주황으로 강조
  const [focused, setFocused] = useState(false);
  const [askPasscode, setAskPasscode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const complete = code.length === CODE_LENGTH;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 8자리가 채워지면 암호가 걸린 방인지 미리 확인해서 입력창을 보여줍니다
  useEffect(() => {
    if (!complete) {
      setAskPasscode(false);
      return;
    }
    let alive = true;
    void needsPasscode(code).then((needs) => {
      if (alive) setAskPasscode(needs);
    });
    return () => {
      alive = false;
    };
  }, [code, complete, needsPasscode]);

  const change = (raw: string) => {
    const next = raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, CODE_LENGTH);
    setHot(next.length > code.length);
    setCode(next);
    setError(null);
  };

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    try {
      const message = await onSubmit({ code, passcode });
      if (message) {
        setError(message);
        setHot(false);
        inputRef.current?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="screen">
      <TopBar title="코드로 입장하기" onBack={onBack} />
      <div className="join">
        <div className="join__body">
          <h2 className="join__title">8자리 코드를 입력해주세요</h2>
          <p className="join__sub">※ 받은 링크가 있다면 코드 없이 바로 열려요</p>

          <div className="code-input" data-invalid={Boolean(error)}>
            <div className="code-input__boxes" aria-hidden="true">
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <div
                  key={i}
                  className="code-cell"
                  data-filled={i < code.length}
                  data-hot={hot && focused && i === code.length - 1}
                >
                  {code[i] ?? ''}
                </div>
              ))}
            </div>
            <input
              ref={inputRef}
              className="code-input__field"
              value={code}
              onChange={(event) => change(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace') setHot(false);
                if (event.key === 'Enter') void submit();
              }}
              inputMode="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="8자리 참여 코드"
              maxLength={CODE_LENGTH}
            />
          </div>

          {askPasscode && (
            <div style={{ width: '100%', marginTop: 24 }}>
              <TextField
                label="입장 암호"
                placeholder="방장에게 받은 암호"
                type="password"
                value={passcode}
                onChange={(event) => {
                  setPasscode(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit();
                }}
              />
            </div>
          )}
        </div>

        <p className="join__error" data-visible={Boolean(error)} aria-live="polite">
          {error ? `* ${error}` : '\u00A0'}
        </p>
        <MenuButton onClick={() => void submit()} disabled={!complete || submitting}>
          {submitting ? '확인 중...' : '입장하기'}
        </MenuButton>
      </div>
    </div>
  );
}
