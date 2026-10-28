import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    dialog.querySelector('input:not([type="checkbox"])')?.focus();
    const cancel = (e) => { e.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className={`modal ${wide ? 'modal-wide' : ''}`} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Cerrar ventana"><X size={21} /></button></div>
    {children}
  </dialog>;
}

