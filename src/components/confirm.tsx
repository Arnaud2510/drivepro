import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from './ui';

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** The user must type this word to confirm (irreversible actions). */
  requireText?: string;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<Ask>(async () => false);

/**
 * In-page confirmation dialog. Replaces window.confirm/prompt, which are blocked in embedded
 * previews and look out of place on phones.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((o) => new Promise((resolve) => {
    setTyped('');
    setState({ ...o, resolve });
  }), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  useEffect(() => {
    if (!state) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const blocked = !!state?.requireText && typed.trim() !== state.requireText;
  return (
    <Ctx.Provider value={ask}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => close(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-msg" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p id="confirm-msg" className="text-base text-slate-800">
              {state.message}
            </p>
            {state.requireText && (
              <div className="mt-4">
                <Input label={t('common.typeToConfirm', { word: state.requireText })} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelRef} variant="secondary" onClick={() => close(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant={state.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)}>
                {state.confirmLabel ?? t('common.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
