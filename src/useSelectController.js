import { useRef, useState } from 'react';

const searchable = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export default function useSelectController({ options, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const typed = useRef({ text: '', at: 0 });
  const selectedIndex = options.findIndex(option => option.value === value);
  const available = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const enabled = !disabled && available.length > 0;
  const preferred = available.includes(selectedIndex) ? selectedIndex : available[0];

  function close() { setOpen(false); typed.current = { text: '', at: 0 }; }
  function highlight(index) { if (enabled && available.includes(index)) setActiveIndex(index); }
  function toggle() {
    if (!enabled) return;
    if (open) close();
    else { setActiveIndex(preferred); setOpen(true); }
  }
  function choose(index) {
    if (!enabled || !available.includes(index)) return;
    if (options[index].value !== value) onChange(options[index].value);
    close();
  }
  function onKeyDown(event) {
    if (!enabled) return;
    const { key } = event;
    if (key === 'Tab') { close(); return; }
    if (key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation?.(); close(); } return; }
    if (['Enter', ' '].includes(key)) {
      event.preventDefault();
      if (open) choose(activeIndex); else toggle();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      let next = preferred;
      if (key === 'Home') next = available[0];
      else if (key === 'End') next = available.at(-1);
      else if (open) {
        const position = available.indexOf(activeIndex);
        next = available[(position + (key === 'ArrowDown' ? 1 : -1) + available.length) % available.length];
      }
      setActiveIndex(next); setOpen(true);
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const input = now - typed.current.at < 700 ? typed.current.text + key : key;
      const repeated = [...input].every(character => character === input[0]);
      const query = searchable(repeated ? key : input);
      const ordered = [...available.filter(index => index > activeIndex), ...available.filter(index => index <= activeIndex)];
      const match = ordered.find(index => searchable(options[index].label).startsWith(query));
      typed.current = { text: input, at: now };
      if (match !== undefined) { event.preventDefault(); setActiveIndex(match); setOpen(true); }
    }
  }
  return { open: open && enabled, activeIndex, selected: options[selectedIndex], toggle, close, choose, highlight, onKeyDown };
}
