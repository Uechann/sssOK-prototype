import {
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { IconBack, IconCheck, IconClose } from './Icons';
import { useKey } from '../lib/hooks';
import './ui.css';

/* ── 버튼 ───────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({
  variant = 'primary',
  small,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${small ? 'btn--sm' : ''} ${className}`}
      {...rest}
    />
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    tone?: 'danger';
    active?: boolean;
  }
>(function IconButton({ label, tone, active, className = '', children, ...rest }, ref) {
  return (
    <button
      type="button"
      ref={ref}
      aria-label={label}
      title={label}
      data-tone={tone}
      data-active={active}
      className={`icon-btn ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ── 상단 바 ────────────────────────────────────────── */

export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="topbar">
      {onBack && (
        <IconButton label="뒤로" onClick={onBack}>
          <IconBack />
        </IconButton>
      )}
      <h1 className="topbar__title">{title}</h1>
    </header>
  );
}

/* ── 입력 ──────────────────────────────────────────── */

export function TextField({
  label,
  maxLength,
  error,
  value,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | null;
  value: string;
}) {
  const id = useId();
  return (
    <div className={`field ${className}`} data-invalid={Boolean(error)}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        className="field__box"
        value={value}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {(error || maxLength) && (
        <div className="field__meta">
          {error && <span className="field__error">* {error}</span>}
          {maxLength && (
            <span className="field__count">
              {value.length} / {maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 세그먼트 ──────────────────────────────────────── */

export function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="segment" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segment__item"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/* ── 오버레이 ──────────────────────────────────────── */

function useLockedFocus(active: boolean, onClose?: () => void) {
  useKey(
    (event) => {
      if (event.key === 'Escape' && onClose) {
        event.stopPropagation();
        onClose();
      }
    },
    active && Boolean(onClose),
  );
}

export function Modal({
  title,
  titleIcon,
  desc,
  art,
  align = 'center',
  hideClose,
  onClose,
  children,
  actions,
}: {
  title: ReactNode;
  titleIcon?: ReactNode;
  desc?: ReactNode;
  art?: ReactNode;
  align?: 'center' | 'left';
  hideClose?: boolean;
  onClose?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  useLockedFocus(true, onClose);
  return (
    <div className="overlay overlay--center" onClick={onClose} role="presentation">
      <div
        className="modal"
        data-align={align}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {onClose && !hideClose && (
          <IconButton label="닫기" className="modal__close" onClick={onClose}>
            <IconClose size={22} />
          </IconButton>
        )}
        {art && <div className="modal__art">{art}</div>}
        <h2 className="modal__title">
          {titleIcon}
          {title}
        </h2>
        {desc && <p className="modal__desc">{desc}</p>}
        {children}
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Sheet({
  title,
  desc,
  trailing,
  onClose,
  grabber = true,
  dismissible = true,
  children,
}: {
  title: ReactNode;
  desc?: ReactNode;
  trailing?: ReactNode;
  onClose: () => void;
  grabber?: boolean;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const close = dismissible ? onClose : undefined;
  useLockedFocus(true, close);
  return (
    <div className="overlay overlay--bottom" onClick={close} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {grabber && <div className="sheet__grabber" />}
        <div className="sheet__head" data-with-desc={Boolean(desc)}>
          <h2 className="sheet__title">{title}</h2>
          {trailing}
        </div>
        {desc && <p className="sheet__desc">{desc}</p>}
        {children}
      </div>
    </div>
  );
}

export function Popover({
  anchorRect,
  onClose,
  children,
  width = 178,
}: {
  anchorRect: DOMRect;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<DOMRect | null>(null);
  useLockedFocus(true, onClose);

  // 앵커 좌표를 앱 셸 기준으로 환산 (레이어가 붙은 뒤에야 알 수 있습니다)
  useLayoutEffect(() => {
    if (layer.current) setHost(layer.current.getBoundingClientRect());
  }, [anchorRect]);

  const top = anchorRect.bottom - (host?.top ?? 0) + 8;
  const right = (host?.right ?? window.innerWidth) - anchorRect.right;

  return (
    <div className="popover-layer" ref={layer} onClick={onClose} role="presentation">
      <div
        className="popover"
        style={{ top, right: Math.max(8, right), width, visibility: host ? 'visible' : 'hidden' }}
        role="menu"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function PopoverItem({
  icon,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; active?: boolean }) {
  return (
    <button type="button" role="menuitem" className="popover__item" data-active={active} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export const PopoverSeparator = () => <div className="popover__sep" />;

/* ── 토스트 ────────────────────────────────────────── */

export function ToastLayer({
  toasts,
  onDismiss,
}: {
  toasts: { id: string; message: string; tone: 'success' | 'warn' }[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-layer" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-tone={toast.tone}>
          <span className="toast__icon">
            {toast.tone === 'warn' ? (
              <strong style={{ fontSize: 13, lineHeight: 1 }}>!</strong>
            ) : (
              <IconCheck size={14} />
            )}
          </span>
          <span className="toast__text">{toast.message}</span>
          <button type="button" className="toast__close" onClick={() => onDismiss(toast.id)}>
            닫기
          </button>
        </div>
      ))}
    </div>
  );
}
