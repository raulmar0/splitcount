import { useContext, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import AuthContext from './AuthContext.js';
import GoogleSignIn from './GoogleSignIn.jsx';
import { workspaceAccess } from './workspace-access.js';

export default function Modal({ title, subtitle, children, onClose, wide = false, className = '', closeDisabled = false }) {
  const auth = useContext(AuthContext);
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);
  closeRef.current = onClose;
  disabledRef.current = closeDisabled;
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    dialog.querySelector('input:not([type="checkbox"])')?.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    const cancel = (e) => { e.preventDefault(); if (!disabledRef.current) closeRef.current(); };
    dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); };
  }, []);
  return <dialog ref={ref} aria-label={title} data-close-disabled={closeDisabled} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} onClick={e => { if (!closeDisabled && e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} disabled={closeDisabled} aria-label="Cerrar ventana"><X size={21} /></button></div>
    {auth?.account && workspaceAccess(auth).accountId && !auth.session && <div className="session-renewal"><p>Vuelve a entrar con {auth.account.email} para sincronizar los grupos compartidos. Tu formulario se conserva.</p><GoogleSignIn auth={auth} theme={document.documentElement.dataset.theme} /></div>}
    {children}
  </dialog>;
}

