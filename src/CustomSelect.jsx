import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import useSelectController from './useSelectController.js';
import './custom-select.css';

// The popup stays inside its dialog's top layer while fixed positioning avoids
// clipping by the form's scrolling container. Focus remains on the combobox.
export default function CustomSelect({ value, onChange, options, id, disabled = false, className = '', ref, ...aria }) {
  const generatedId = useId();
  const controlId = id || `select-${generatedId}`;
  const listId = `${controlId}-options`;
  const root = useRef(null), trigger = useRef(null), popup = useRef(null);
  const [position, setPosition] = useState(null);
  const [implicitLabel, setImplicitLabel] = useState('');
  const control = useSelectController({ value, onChange, options, disabled });
  const optionId = index => `${controlId}-option-${index}`;

  useEffect(() => {
    if (aria['aria-label'] || aria['aria-labelledby']) return;
    const label = trigger.current?.labels?.[0] || root.current?.closest('label');
    if (!label) return;
    const text = [...label.childNodes].filter(node => node !== root.current).map(node => node.textContent).join(' ').trim();
    setImplicitLabel(text);
  }, [aria['aria-label'], aria['aria-labelledby']]);

  useLayoutEffect(() => {
    if (!control.open) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = globalThis.visualViewport;
      const width = viewport?.width || globalThis.innerWidth;
      const height = viewport?.height || globalThis.innerHeight;
      const offsetTop = viewport?.offsetTop || 0;
      const offsetLeft = viewport?.offsetLeft || 0;
      const below = height + offsetTop - rect.bottom - 12;
      const above = rect.top - offsetTop - 12;
      const upward = below < 160 && above > below;
      const maxHeight = Math.min(280, Math.max(96, upward ? above : below));
      const popupWidth = Math.min(Math.max(rect.width, 200), width - 24);
      setPosition({
        left: Math.max(offsetLeft + 12, Math.min(rect.left, width + offsetLeft - popupWidth - 12)),
        width: popupWidth, maxHeight,
        top: upward ? undefined : rect.bottom + 6,
        bottom: upward ? globalThis.innerHeight - rect.top + 6 : undefined,
      });
    }
    place();
    const outside = event => { if (!root.current?.contains(event.target)) control.close(); };
    const blur = event => { if (!root.current?.contains(event.target)) control.close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', blur);
    globalThis.addEventListener('resize', place);
    globalThis.addEventListener('scroll', place, true);
    globalThis.visualViewport?.addEventListener('resize', place);
    globalThis.visualViewport?.addEventListener('scroll', place);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', blur);
      globalThis.removeEventListener('resize', place);
      globalThis.removeEventListener('scroll', place, true);
      globalThis.visualViewport?.removeEventListener('resize', place);
      globalThis.visualViewport?.removeEventListener('scroll', place);
    };
  }, [control.open]);

  useEffect(() => {
    if (!control.open) return;
    popup.current?.querySelector(`[data-option-index="${control.activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [control.open, control.activeIndex]);

  return <span className={`custom-select ${className}`} ref={root} data-open={control.open || undefined}>
    <button
      ref={node => { trigger.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
      id={controlId} type="button" role="combobox" aria-haspopup="listbox"
      aria-expanded={control.open} aria-controls={listId}
      aria-activedescendant={control.open && control.activeIndex >= 0 ? optionId(control.activeIndex) : undefined}
      {...aria} aria-label={aria['aria-label'] || implicitLabel || undefined}
      disabled={disabled || !options.some(option => !option.disabled)}
      className="custom-select-trigger" onClick={control.toggle} onKeyDown={control.onKeyDown}
    ><span>{control.selected?.label || 'Seleccionar'}</span><ChevronDown size={17} aria-hidden="true" /></button>
    {control.open && <span ref={popup} id={listId} role="listbox" aria-label={aria['aria-label'] || implicitLabel || 'Opciones'} className="custom-select-popup" style={position || { visibility: 'hidden' }}>
      {options.map((option, index) => <span
        key={option.value} id={optionId(index)} role="option" data-option-index={index}
        aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        className={`custom-select-option ${index === control.activeIndex ? 'highlighted' : ''}`}
        onPointerMove={event => { if (event.pointerType !== 'touch') control.highlight(index); }}
        onPointerDown={event => event.preventDefault()}
        onClick={event => { event.preventDefault(); event.stopPropagation(); control.choose(index); trigger.current?.focus(); }}
      ><span>{option.label}</span>{option.value === value && <Check size={17} aria-hidden="true" />}</span>)}
    </span>}
  </span>;
}
