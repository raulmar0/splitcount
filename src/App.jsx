import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, Plus, Search, ChevronDown, ChevronRight, X, Check, CheckCheck, Download, Upload, Settings2, Users, LayoutGrid, Clock3, HelpCircle, Leaf, MoreHorizontal, Utensils, Car, BedDouble, ShoppingBag, Sparkles, ReceiptText, ArrowLeftRight, Trash2, Pencil, Wallet, Menu, ShieldCheck, Coffee, Copy, FileJson, CircleCheck, SlidersHorizontal } from 'lucide-react';
import { calculateBalances, suggestSettlements, splitAmount, formatMoney, parseMoney, loadState, saveState, validateState, isDate } from './domain.js';
import { createInitialState } from './seed.js';
import { normalizeMembers } from './groups.js';

const CATEGORIES = {
  food: { name: 'Comida y bebida', icon: Utensils, color: 'peach' },
  stay: { name: 'Hospedaje', icon: BedDouble, color: 'lavender' },
  transport: { name: 'Transporte', icon: Car, color: 'blue' },
  shopping: { name: 'Compras', icon: ShoppingBag, color: 'pink' },
  fun: { name: 'Experiencias', icon: Sparkles, color: 'yellow' },
  other: { name: 'Otros', icon: ReceiptText, color: 'mint' },
};
const uid = () => globalThis.crypto.randomUUID();
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const moneyInput = (cents) => (cents / 100).toFixed(2);
const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
const fullDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const memberName = (group, id) => group.members.find(m => m.id === id)?.name || 'Integrante';
const currencyLabel = (currency) => ({ MXN: 'Pesos mexicanos', USD: 'Dólares estadounidenses', EUR: 'Euros' }[currency]);

function Avatar({ member, index = 0, small = false }) {
  return <span className={`avatar avatar-${index % 5} ${small ? 'small' : ''}`} title={member.name}>{member.id === 'you' ? 'T' : member.name.slice(0, 1).toUpperCase()}</span>;
}

function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const cancel = (e) => { e.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className={`modal ${wide ? 'modal-wide' : ''}`} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="modal-head"><div><span className="eyebrow">ENTRE AMIGOS</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Cerrar ventana"><X size={21} /></button></div>
    {children}
  </dialog>;
}

function ExpenseForm({ group, expense, onSave, onClose }) {
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(expense ? moneyInput(expense.amount) : '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy || group.members[0].id);
  const [participants, setParticipants] = useState(expense?.participants || group.members.map(m => m.id));
  const [mode, setMode] = useState(expense?.splitMode || 'equal');
  const [exact, setExact] = useState(Object.fromEntries(group.members.map(m => [m.id, expense?.shares[m.id] !== undefined ? moneyInput(expense.shares[m.id]) : ''])));
  const [category, setCategory] = useState(expense?.category || 'food');
  const [date, setDate] = useState(expense?.date || today());
  const [note, setNote] = useState(expense?.note || '');
  const [error, setError] = useState('');
  const cents = parseMoney(amount);
  const exactTotal = participants.reduce((sum, id) => sum + (parseMoney(exact[id]) ?? 0), 0);
  const shares = cents > 0 && participants.length && mode === 'equal' ? splitAmount(cents, participants) : {};
  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return setError('Escribe una descripción para el gasto.');
    if (!cents || cents > 10000000000) return setError('Escribe un importe válido mayor a cero (máximo 100 millones).');
    if (!participants.length) return setError('Elige al menos una persona para repartir el gasto.');
    if (!isDate(date)) return setError('Elige una fecha válida.');
    if (mode === 'exact' && (participants.some(id => parseMoney(exact[id]) === null) || exactTotal !== cents)) return setError('Los importes de cada persona deben sumar el total del gasto.');
    onSave({ id: expense?.id || uid(), title: title.trim(), amount: cents, paidBy, participants, splitMode: mode, shares: mode === 'equal' ? shares : Object.fromEntries(participants.map(id => [id, parseMoney(exact[id])])), category, date, note: note.trim() });
  }
  return <Modal title={expense ? 'Editar gasto' : 'Un gasto, bien repartido.'} subtitle="Tú disfruta el plan. Nosotros hacemos las cuentas." onClose={onClose} wide>
    <form onSubmit={submit} className="form-stack">
      <label>¿En qué gastaron?<input autoFocus required maxLength={100} placeholder="Por ejemplo, la cena del viernes" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <div className="amount-field"><span>{group.currency}</span><input aria-label="Importe total" required inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /><span className="amount-symbol">$</span></div>
      <div className="form-grid"><label>Pagó<select value={paidBy} onChange={e => setPaidBy(e.target.value)}>{group.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label></div>
      <label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(CATEGORIES).map(([key, cat]) => <option value={key} key={key}>{cat.name}</option>)}</select></label>
      <div className="split-label"><span>Repartir entre</span><div className="segmented"><button type="button" className={mode === 'equal' ? 'selected' : ''} onClick={() => setMode('equal')}>Por igual</button><button type="button" className={mode === 'exact' ? 'selected' : ''} onClick={() => setMode('exact')}>Importes exactos</button></div></div>
      <div className="split-members">{group.members.map((m, i) => <div className="split-member" key={m.id}><label className="check-label"><input type="checkbox" checked={participants.includes(m.id)} onChange={e => setParticipants(e.target.checked ? [...participants, m.id] : participants.filter(id => id !== m.id))} /><Avatar member={m} index={i} small /><span>{m.name}</span></label>{participants.includes(m.id) && (mode === 'exact' ? <div className="exact-field"><span>$</span><input aria-label={`Importe de ${m.name}`} inputMode="decimal" placeholder="0.00" value={exact[m.id]} onChange={e => setExact({ ...exact, [m.id]: e.target.value })} /></div> : <span className="muted">{formatMoney(shares[m.id] || 0, group.currency)}</span>)}</div>)}</div>
      {mode === 'exact' && <p className={`split-remainder ${cents === exactTotal ? 'positive' : ''}`}>{cents === exactTotal ? 'El reparto cuadra perfecto.' : `Faltan por repartir ${formatMoney((cents || 0) - exactTotal, group.currency)}`}</p>}
      <label>Nota <span className="optional">opcional</span><input maxLength={300} placeholder="Algo que quieras recordar" value={note} onChange={e => setNote(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit"><Check size={17} />{expense ? 'Guardar cambios' : 'Añadir gasto'}</button></div>
    </form>
  </Modal>;
}

function GroupForm({ group, onSave, onClose }) {
  const [name, setName] = useState(group?.name || '');
  const [emoji, setEmoji] = useState(group?.emoji || '🌴');
  const [currency, setCurrency] = useState(group?.currency || 'MXN');
  const [description, setDescription] = useState(group?.description || '');
  const [members, setMembers] = useState(group?.members || [{ id: 'you', name: 'Tú' }, { id: uid(), name: '' }]);
  const [error, setError] = useState('');
  const hasHistory = group && (group.expenses.length > 0 || group.settlements.length > 0);
  function submit(e) {
    e.preventDefault();
    const cleaned = normalizeMembers(members);
    if (!name.trim()) return setError('Dale un nombre al grupo.');
    if (!cleaned) return setError('Añade al menos dos personas con nombres diferentes. Completa los nombres o quita las filas vacías.');
    onSave({ ...(group || { id: uid(), expenses: [], settlements: [] }), name: name.trim(), emoji, currency, description: description.trim(), members: cleaned });
  }
  return <Modal title={group ? 'Este es tu grupo.' : 'Los buenos planes se comparten.'} subtitle={group ? 'Edita los detalles o suma a alguien más.' : 'Crea un grupo y deja las cuentas en nuestras manos.'} onClose={onClose}>
    <form onSubmit={submit} className="form-stack"><div className="emoji-picker">{['🌴', '🌵', '🏡', '🍕', '✈️', '🎉', '🏕️', '☕'].map(item => <button type="button" key={item} aria-label={`Elegir ${item}`} className={emoji === item ? 'selected' : ''} onClick={() => setEmoji(item)}>{item}</button>)}</div>
      <label>Nombre del grupo<input autoFocus required maxLength={60} placeholder="¿Cuál es el próximo plan?" value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Descripción <span className="optional">opcional</span><input maxLength={200} placeholder="Unas palabras sobre este grupo" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Moneda<select value={currency} disabled={hasHistory} onChange={e => setCurrency(e.target.value)}>{['MXN', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c} · {currencyLabel(c)}</option>)}</select></label>{hasHistory && <p className="field-hint">La moneda se conserva cuando ya hay movimientos.</p>}
      <div className="label-row"><span>¿Quiénes se apuntan?</span><span className="muted">{members.length} personas</span></div>
      <div className="member-inputs">{members.map((m, i) => <div className="member-input" key={m.id}><Avatar member={{ ...m, name: m.name || '?' }} index={i} small /><input aria-label={`Nombre de integrante ${i + 1}`} required={i < 2 || !!group?.members.find(gm => gm.id === m.id)} maxLength={40} value={m.name} placeholder={`Nombre de la persona ${i + 1}`} onChange={e => setMembers(members.map(mem => mem.id === m.id ? { ...mem, name: e.target.value } : mem))} />{!group?.members.find(gm => gm.id === m.id) && m.id !== 'you' && <button className="icon-button" type="button" aria-label={`Quitar integrante ${i + 1}`} onClick={() => setMembers(members.filter(mem => mem.id !== m.id))}><X size={16} /></button>}</div>)}</div>
      {members.length < 30 && <button type="button" className="text-button" onClick={() => setMembers([...members, { id: uid(), name: '' }])}><Plus size={16} />Añadir persona</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button primary">{group ? 'Guardar grupo' : 'Crear grupo'}<ArrowRight size={17} /></button></div>
    </form>
  </Modal>;
}

function PaymentForm({ group, transfer, onSave, onClose }) {
  const [from, setFrom] = useState(transfer?.from || group.members[0].id);
  const [to, setTo] = useState(transfer?.to || group.members[1].id);
  const [amount, setAmount] = useState(transfer ? moneyInput(transfer.amount) : '');
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  function submit(e) {
    e.preventDefault(); const cents = parseMoney(amount);
    if (from === to) return setError('Elige dos personas diferentes.');
    if (!cents || cents > 10000000000) return setError('Introduce un importe válido mayor a cero (máximo 100 millones).');
    if (!isDate(date)) return setError('Elige una fecha válida.');
    onSave({ id: uid(), from, to, amount: cents, date });
  }
  return <Modal title="Cuentas saldadas, amistad intacta." subtitle="Registra un pago que ya se hizo fuera de Entre." onClose={onClose}>
    <form onSubmit={submit} className="form-stack"><div className="form-grid"><label>Quién pagó<select value={from} onChange={e => setFrom(e.target.value)}>{group.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>A quién<select value={to} onChange={e => setTo(e.target.value)}>{group.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div>
      <div className="amount-field"><span>{group.currency}</span><input autoFocus aria-label="Importe del pago" required inputMode="decimal" value={amount} placeholder="0.00" onChange={e => setAmount(e.target.value)} /></div>
      <label>Fecha del pago<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
      <p className="info-note"><ShieldCheck size={18} />Entre lleva el registro. El dinero se transfiere por el medio que ustedes prefieran.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit"><CheckCheck size={18} />Registrar pago</button></div>
    </form>
  </Modal>;
}

function ExpenseDetail({ group, expense, onClose, onEdit, onDelete }) {
  const cat = CATEGORIES[expense.category] || CATEGORIES.other; const Icon = cat.icon;
  return <Modal title={expense.title} subtitle={`${cat.name} · ${fullDate(expense.date)}`} onClose={onClose}>
    <div className="detail-total"><div className={`category-icon ${cat.color}`}><Icon size={26} /></div><strong>{formatMoney(expense.amount, group.currency)}</strong><span className="muted">Pagó {memberName(group, expense.paidBy)} · {group.currency}</span></div>
    <h3>Así se repartió</h3><div className="split-members">{expense.participants.map(id => { const index = group.members.findIndex(m => m.id === id); return <div className="split-member" key={id}><span className="person-label"><Avatar member={group.members[index]} index={index} small />{memberName(group, id)}</span><strong>{formatMoney(expense.shares[id], group.currency)}</strong></div>; })}</div>
    {expense.note && <p className="detail-note">{expense.note}</p>}
    <div className="modal-actions spread"><button className="text-button danger" onClick={onDelete}><Trash2 size={17} />Eliminar gasto</button><button className="button primary" onClick={onEdit}><Pencil size={16} />Editar gasto</button></div>
  </Modal>;
}

function ConfirmDialog({ title, message, label = 'Eliminar', onConfirm, onClose }) {
  return <Modal title={title} onClose={onClose}><p className="confirm-message">{message}</p><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancelar</button><button className="button destructive" onClick={onConfirm}>{label}</button></div></Modal>;
}

function EmptyState({ onAdd, filtered }) {
  return <div className="empty-state"><span className="empty-icon"><ReceiptText size={30} /></span><h3>{filtered ? 'Por aquí no hay coincidencias.' : 'El plan empieza aquí.'}</h3><p>{filtered ? 'Prueba con otro nombre o cambia la categoría.' : 'Añade el primer gasto y empieza a compartir.'}</p>{!filtered && <button className="button primary" onClick={onAdd}><Plus size={17} />Añadir primer gasto</button>}</div>;
}

export default function App() {
  const [state, setState] = useState(() => loadState() || createInitialState());
  const [tab, setTab] = useState('expenses');
  const [view, setView] = useState('groups');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recent');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [groupMenu, setGroupMenu] = useState(false);
  const importRef = useRef(null);
  const group = state.groups.find(g => g.id === state.activeGroupId) || state.groups[0];
  const balances = useMemo(() => group ? calculateBalances(group) : {}, [group]);
  const transfers = useMemo(() => group ? suggestSettlements(group) : [], [group]);
  const total = group?.expenses.reduce((sum, exp) => sum + exp.amount, 0) || 0;
  const me = group?.members.find(m => m.id === 'you')?.id || group?.members[0]?.id;
  const myBalance = balances[me] || 0;
  useEffect(() => { setStorageError(!saveState(state)); }, [state]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!groupMenu) return; const close = () => setGroupMenu(false); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, [groupMenu]);
  const updateGroup = (updated) => setState(s => ({ ...s, groups: s.groups.map(g => g.id === updated.id ? updated : g) }));
  function selectGroup(id) { setState(s => ({ ...s, activeGroupId: id })); setView('groups'); setTab('expenses'); setQuery(''); setCategory('all'); setMobileMenu(false); }
  function exportFile(data, filename, type) { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportJSON() { exportFile(JSON.stringify(state, null, 2), 'entre-respaldo.json', 'application/json'); setToast('Respaldo descargado. Tus planes, a salvo.'); }
  function exportCSV() {
    const escape = value => { const text = String(value ?? ''); return `"${/^[=+\-@\t\r]/.test(text) ? "'" : ''}${text.replaceAll('"', '""')}"`; };
    const rows = [['Fecha', 'Descripción', 'Categoría', 'Pagó', 'Importe', 'Moneda', ...group.members.map(m => `Parte de ${m.name}`)], ...group.expenses.map(exp => [exp.date, exp.title, (CATEGORIES[exp.category] || CATEGORIES.other).name, memberName(group, exp.paidBy), moneyInput(exp.amount), group.currency, ...group.members.map(m => moneyInput(exp.shares[m.id] || 0))])];
    exportFile('\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n'), `entre-${group.name.replace(/[^\p{L}\p{N}]/gu, '-')}.csv`, 'text/csv;charset=utf-8'); setToast('Gastos exportados a CSV.');
  }
  async function importJSON(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 5_000_000) return setToast('El respaldo debe pesar menos de 5 MB.');
    try { const data = JSON.parse(await file.text()); if (!validateState(data)) throw new Error('invalid'); setModal({ type: 'import', data }); } catch { setToast('Este archivo no es un respaldo válido de Entre.'); }
  }
  const filteredExpenses = useMemo(() => group ? group.expenses.filter(exp => (category === 'all' || exp.category === category) && `${exp.title} ${memberName(group, exp.paidBy)} ${exp.note}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 'amount' ? b.amount - a.amount : b.date.localeCompare(a.date)) : [], [group, category, query, sort]);
  const categories = Object.entries(CATEGORIES).map(([key, value]) => ({ ...value, key, amount: group?.expenses.filter(exp => exp.category === key).reduce((sum, exp) => sum + exp.amount, 0) || 0 })).filter(cat => cat.amount).sort((a, b) => b.amount - a.amount);
  const activity = group ? [...group.expenses.map(exp => ({ ...exp, type: 'expense' })), ...group.settlements.map(payment => ({ ...payment, type: 'payment' }))].sort((a, b) => b.date.localeCompare(a.date)) : [];

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('groups'); setMobileMenu(false); }} aria-label="Entre, inicio"><span className="brand-mark"><span /><span /><span /></span>entre<span className="brand-dot">.</span></a>
      <span className="sidebar-tagline">BUENAS CUENTAS, BUENOS AMIGOS.</span>
      <nav className="main-nav" aria-label="Navegación principal"><button className={view === 'groups' ? 'active' : ''} onClick={() => { setView('groups'); setMobileMenu(false); }}><LayoutGrid size={19} />Mis grupos<span className="nav-count">{state.groups.length}</span></button><button className={view === 'activity' ? 'active' : ''} onClick={() => { setView('activity'); setMobileMenu(false); }}><Clock3 size={19} />Actividad</button></nav>
      <div className="sidebar-section"><span>TUS GRUPOS</span><button className="icon-button" aria-label="Crear grupo" onClick={() => { setModal({ type: 'group' }); setMobileMenu(false); }}><Plus size={17} /></button></div>
      <div className="group-nav">{state.groups.map(g => <button key={g.id} className={g.id === group?.id ? 'selected' : ''} onClick={() => selectGroup(g.id)}><span className={`group-emoji ${g.id === 'oaxaca' ? 'sand' : g.id === 'casa' ? 'sage' : 'rose'}`}>{g.emoji}</span><span>{g.name}</span>{g.id === group?.id && <span className="selected-dot" />}</button>)}</div>
      <button className="new-group" onClick={() => { setModal({ type: 'group' }); setMobileMenu(false); }}><Plus size={16} />Crear un grupo</button>
      <div className="sidebar-bottom"><div className="friend-card"><span className="friend-doodle">✳</span><strong>Más momentos.<br />Menos cuentas pendientes.</strong><p>Lo bueno de compartir<br />es hacerlo fácil.</p></div><button className="help-link" onClick={() => setModal({ type: 'help' })}><HelpCircle size={18} />Cómo funciona<ArrowUpRight size={15} /></button><button className="profile" onClick={() => setModal({ type: 'data' })}><span className="avatar profile-avatar">T</span><span><strong>Tu espacio</strong><small>Todo guardado en este dispositivo</small></span><Settings2 size={17} /></button></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="Abrir menú" onClick={() => setMobileMenu(true)}><Menu size={22} /></button><span>{view === 'activity' ? 'Actividad' : 'Mis grupos'}</span>{group && <><ChevronRight size={15} /><strong>{group.name}</strong></>}</div><div className="topbar-actions"><span className="local-status"><span />{storageError ? 'Cambios sin guardar' : 'Guardado en tu dispositivo'}</span><button className="icon-button" onClick={() => setModal({ type: 'data' })} aria-label="Respaldos y datos"><Download size={19} /></button><span className="avatar top-avatar">T</span></div></header>
      <main>
        {storageError && <div className="storage-warning" role="alert">No se pudieron guardar los cambios en este navegador. Descarga un respaldo antes de salir.<button onClick={exportJSON}>Descargar respaldo</button></div>}
        {group ? <>
          <div className="page-intro"><div><p className="eyebrow">COMPARTIR SE SIENTE BIEN</p><h1>{view === 'activity' ? 'Cada cuenta, en su lugar.' : 'El plan es disfrutar.'}</h1><p>{view === 'activity' ? 'La historia de los gastos y pagos de tu grupo.' : 'Las cuentas claras. Los buenos momentos, compartidos.'}</p></div><button className="button primary add-top" onClick={() => setModal({ type: 'expense' })}><Plus size={19} />Añadir gasto</button></div>
          <section className={`group-cover ${group.id !== 'oaxaca' ? 'custom-cover' : ''}`} style={group.id === 'oaxaca' ? { backgroundImage: `linear-gradient(90deg, rgba(17,40,33,.79), rgba(17,40,33,.08)), url(${import.meta.env.BASE_URL}oaxaca.jpg)` } : undefined} aria-label={`Grupo ${group.name}`}>
            {group.id !== 'oaxaca' && <span className="cover-illustration">{group.emoji}</span>}
            <div className="cover-content"><span className="cover-kicker">UN PLAN ENTRE AMIGOS {group.isDemo && <span className="demo-badge">Grupo de ejemplo</span>}</span><h2>{group.name}</h2><p>{group.description || 'Los mejores momentos se comparten.'}</p><div className="cover-members"><div className="avatar-stack">{group.members.slice(0, 5).map((m, i) => <Avatar key={m.id} member={m} index={i} small />)}</div><span>{group.members.length} personas <span className="cover-separator">·</span> {group.currency}</span></div></div>
            <div className="cover-options"><button className="cover-menu-button" aria-label="Opciones del grupo" aria-expanded={groupMenu} onClick={e => { e.stopPropagation(); setGroupMenu(!groupMenu); }}><MoreHorizontal size={22} /></button>{groupMenu && <div className="dropdown"><button onClick={() => setModal({ type: 'group', group })}><Pencil size={16} />Editar grupo y personas</button><button onClick={exportCSV}><Download size={16} />Exportar gastos CSV</button><button className="danger" onClick={() => setModal({ type: 'deleteGroup' })}><Trash2 size={16} />Eliminar grupo</button></div>}</div>
          </section>

          <div className="summary-cards"><div className="summary-card balance-card"><div className="summary-label"><span>Tu balance en este grupo</span><span className="summary-icon"><ArrowDownLeft size={18} /></span></div><div className={`big-value ${myBalance >= 0 ? 'positive' : 'negative'}`}>{myBalance > 0 ? '+' : myBalance < 0 ? '−' : ''}{formatMoney(Math.abs(myBalance), group.currency)}<span>{group.currency}</span></div><p><span className={`tiny-dot ${myBalance < 0 ? 'orange' : ''}`} />{myBalance > 0 ? 'Te deben. Todo está en orden.' : myBalance < 0 ? 'Tienes una cuenta por saldar.' : 'Estás al día. Así da gusto.'}</p></div><div className="summary-card"><div className="summary-label"><span>Total del grupo</span><Wallet size={18} /></div><div className="big-value">{formatMoney(total, group.currency)}<span>{group.currency}</span></div><p>{group.expenses.length} gastos compartidos <span className="muted">entre {group.members.length} personas</span></p></div><div className="summary-card per-person"><div className="summary-label"><span>Gasto promedio</span><Users size={18} /></div><div className="big-value">{formatMoney(Math.round(total / group.members.length), group.currency)}<span>{group.currency}</span></div><p>Por persona <span className="muted">· en este grupo</span></p></div></div>

          <div className="content-grid"><section className="main-panel">
            {view === 'groups' ? <><div className="panel-tabs" role="tablist" aria-label="Vista del grupo">{[['expenses', 'Gastos', ReceiptText], ['balances', 'Balances', ArrowLeftRight], ['summary', 'Resumen', LayoutGrid]].map(([id, label, Icon]) => <button role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}><Icon size={17} />{label}{id === 'expenses' && <span className="tab-count">{group.expenses.length}</span>}</button>)}<span className="tab-filler" /><button className="icon-button export-button" onClick={exportCSV} aria-label="Exportar gastos a CSV"><Download size={18} /></button></div>
              {tab === 'expenses' && <><div className="expense-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Buscar gastos" placeholder="Buscar un gasto..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}><X size={14} /></button>}</div><label className="filter-field"><SlidersHorizontal size={15} /><select aria-label="Filtrar por categoría" value={category} onChange={e => setCategory(e.target.value)}><option value="all">Todas las categorías</option>{Object.entries(CATEGORIES).map(([key, cat]) => <option key={key} value={key}>{cat.name}</option>)}</select></label></div>
                <div className="list-heading"><span>{query || category !== 'all' ? `${filteredExpenses.length} resultados` : 'TODOS LOS GASTOS'}</span><label><select aria-label="Ordenar gastos" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Más recientes</option><option value="amount">Mayor importe</option></select><ChevronDown size={13} /></label></div>
                {filteredExpenses.length ? <div className="expense-list">{filteredExpenses.map(exp => { const cat = CATEGORIES[exp.category] || CATEGORIES.other; const Icon = exp.id === 'cafe' ? Coffee : cat.icon; const net = (exp.paidBy === me ? exp.amount : 0) - (exp.shares[me] || 0); return <button className="expense-row" key={exp.id} onClick={() => setModal({ type: 'detail', expense: exp })}><span className={`category-icon ${cat.color}`}><Icon size={21} strokeWidth={1.7} /></span><span className="expense-info"><strong>{exp.title}</strong><span><span className="payer">{exp.paidBy === 'you' ? 'Pagaste tú' : `${memberName(group, exp.paidBy)} pagó`}</span><span className="dot-separator">·</span>{dateLabel(exp.date)}</span></span><span className="expense-amount"><strong>{formatMoney(exp.amount, group.currency)}</strong><span className={net > 0 ? 'positive' : net < 0 ? 'negative' : 'muted'}>{net > 0 ? `te deben ${formatMoney(net, group.currency)}` : net < 0 ? `debes ${formatMoney(-net, group.currency)}` : 'sin saldo para ti'}</span></span><ChevronRight className="row-chevron" size={16} /></button>; })}</div> : <EmptyState onAdd={() => setModal({ type: 'expense' })} filtered={!!query || category !== 'all'} />}
                {!!filteredExpenses.length && <div className="list-footer"><span>{query || category !== 'all' ? 'Total filtrado' : 'Todo al día. A seguir disfrutando.'}</span>{query || category !== 'all' ? <strong>{formatMoney(filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0), group.currency)}</strong> : <span className="footer-check"><CheckCheck size={15} />{group.expenses.length} gastos</span>}</div>}
              </>}
              {tab === 'balances' && <div className="tab-content"><div className="section-title"><div><h3>Así van las cuentas</h3><p>Lo que cada persona recibe o debe al grupo.</p></div><button className="button secondary small-button" onClick={() => setModal({ type: 'payment' })}><Plus size={15} />Pago</button></div><div className="balances-list">{group.members.map((m, i) => <div className="member-balance" key={m.id}><Avatar member={m} index={i} /><div><strong>{m.name}</strong><small>{balances[m.id] > 0 ? 'Recibe del grupo' : balances[m.id] < 0 ? 'Debe al grupo' : 'Está al día'}</small></div><strong className={balances[m.id] >= 0 ? 'positive' : 'negative'}>{balances[m.id] > 0 ? '+' : balances[m.id] < 0 ? '−' : ''}{formatMoney(Math.abs(balances[m.id]), group.currency)}</strong></div>)}</div>
                {group.settlements.length > 0 && <><h3 className="subsection-title">Pagos registrados</h3>{group.settlements.map(payment => <div className="payment-row" key={payment.id}><span className="payment-icon"><CheckCheck size={19} /></span><div><strong>{memberName(group, payment.from)} → {memberName(group, payment.to)}</strong><small>{dateLabel(payment.date)}</small></div><strong>{formatMoney(payment.amount, group.currency)}</strong><button className="icon-button" aria-label={`Eliminar pago de ${memberName(group, payment.from)}`} onClick={() => setModal({ type: 'deletePayment', payment })}><Trash2 size={15} /></button></div>)}</>}
              </div>}
              {tab === 'summary' && <div className="tab-content"><div className="section-title"><div><h3>¿En qué se fue el plan?</h3><p>Cada gasto, un pedacito de la historia.</p></div><span className="currency-pill">{group.currency}</span></div>{total ? <><div className="category-chart">{categories.map(cat => <div key={cat.key} className={`chart-segment ${cat.color}`} style={{ flex: cat.amount }} title={`${cat.name}: ${formatMoney(cat.amount, group.currency)}`} />)}</div><div className="category-breakdown">{categories.map(cat => { const Icon = cat.icon; return <div className="category-summary-row" key={cat.key}><span className={`category-icon ${cat.color}`}><Icon size={19} /></span><div><strong>{cat.name}</strong><div className="category-track"><span className={cat.color} style={{ width: `${100 * cat.amount / total}%` }} /></div></div><span><strong>{formatMoney(cat.amount, group.currency)}</strong><small>{Math.round(100 * cat.amount / total)}% del total</small></span></div>; })}</div><button className="button secondary full-width" onClick={exportCSV}><Download size={17} />Descargar desglose en CSV</button></> : <EmptyState onAdd={() => setModal({ type: 'expense' })} />}</div>}
            </> : <><div className="activity-heading"><Clock3 size={19} /><h3>Actividad del grupo</h3><span>{activity.length} movimientos</span></div><div className="tab-content activity-content">{activity.length ? activity.map(item => <div className="activity-row" key={item.id}><span className={`activity-dot ${item.type === 'payment' ? 'payment' : ''}`}><Check size={13} /></span><div><p>{item.type === 'payment' ? <><strong>{memberName(group, item.from)}</strong> registró un pago a <strong>{memberName(group, item.to)}</strong></> : <><strong>{memberName(group, item.paidBy)}</strong> pagó <strong>{item.title}</strong></>}</p><small>{fullDate(item.date)}</small></div><strong>{formatMoney(item.amount, group.currency)}</strong></div>) : <EmptyState onAdd={() => setModal({ type: 'expense' })} />}</div></>}
          </section>

          <aside className="right-panel"><section className="settle-card"><div className="card-title"><h3>Para quedar a mano</h3><span className="mini-icon"><ArrowLeftRight size={17} /></span></div><p className="card-subtitle">Menos transferencias, mismas cuentas.</p>{transfers.length ? <div className="transfers">{transfers.map((transfer, i) => <div className="transfer" key={`${transfer.from}-${transfer.to}-${i}`}><div className="transfer-people"><Avatar member={group.members.find(m => m.id === transfer.from)} index={group.members.findIndex(m => m.id === transfer.from)} small /><span><strong>{memberName(group, transfer.from)}</strong><ArrowRight size={12} /><strong>{memberName(group, transfer.to)}</strong></span></div><div className="transfer-bottom"><strong>{formatMoney(transfer.amount, group.currency)}</strong><button onClick={() => setModal({ type: 'payment', transfer })}>Registrar pago<ArrowUpRight size={13} /></button></div></div>)}</div> : <div className="all-settled"><CircleCheck size={37} /><strong>¡Están a mano!</strong><p>Las cuentas claras se sienten bien.</p></div>}<button className="button secondary full-width settle-button" onClick={() => setModal({ type: 'payment' })}><CheckCheck size={17} />Registrar un pago</button><div className="settle-footnote"><Leaf size={13} />Sin vueltas. Sin cuentas pendientes.</div></section>
          <section className="members-card"><div className="card-title"><h3>La buena compañía</h3><button className="icon-button" aria-label="Editar integrantes" onClick={() => setModal({ type: 'group', group })}><Plus size={17} /></button></div><div className="members-preview">{group.members.slice(0, 5).map((m, i) => <div key={m.id}><Avatar member={m} index={i} /><span>{m.name}</span></div>)}</div>{group.members.length > 5 && <p className="extra-members">Y {group.members.length - 5} personas más</p>}</section>
          <div className="little-note"><span>✳</span><p>Las mejores cosas de la vida<br />se comparten. Las cuentas también.</p></div></aside></div>
          <footer className="page-footer"><span>Hecho para compartir, sin complicaciones.</span><span>entre. <span>un plan en común</span></span></footer>
        </> : <div className="welcome-empty"><span className="welcome-emoji">✳</span><p className="eyebrow">BIENVENIDO A ENTRE</p><h1>Un plan en común.</h1><p>Viajes, cenas o el depa. Comparte los momentos<br />y reparte los gastos sin complicaciones.</p><button className="button primary" onClick={() => setModal({ type: 'group' })}><Plus size={18} />Crear mi primer grupo</button><button className="text-button" onClick={() => importRef.current.click()}><Upload size={16} />Importar un respaldo</button></div>}
      </main>
    </div>

    <input className="visually-hidden" type="file" accept="application/json,.json" ref={importRef} onChange={importJSON} aria-label="Importar respaldo JSON" tabIndex={-1} />
    {toast && <div className="toast" role="status"><CircleCheck size={19} /><span>{toast}</span><button aria-label="Cerrar aviso" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal?.type === 'expense' && group && <ExpenseForm group={group} expense={modal.expense} onClose={() => setModal(null)} onSave={expense => { updateGroup({ ...group, expenses: modal.expense ? group.expenses.map(exp => exp.id === expense.id ? expense : exp) : [expense, ...group.expenses] }); setModal(null); setToast(modal.expense ? 'Gasto actualizado. Cuentas claras.' : 'Gasto añadido. Ya hicimos las cuentas.'); }} />}
    {modal?.type === 'group' && <GroupForm group={modal.group} onClose={() => setModal(null)} onSave={saved => { setState(s => ({ ...s, activeGroupId: saved.id, groups: modal.group ? s.groups.map(g => g.id === saved.id ? saved : g) : [...s.groups, saved] })); setTab('expenses'); setView('groups'); setCategory('all'); setQuery(''); setModal(null); setToast(modal.group ? 'El grupo está actualizado.' : '¡Ya tienen un plan en común!'); }} />}
    {modal?.type === 'payment' && group && <PaymentForm group={group} transfer={modal.transfer} onClose={() => setModal(null)} onSave={payment => { updateGroup({ ...group, settlements: [payment, ...group.settlements] }); setModal(null); setToast('Pago registrado. Una cuenta menos.'); }} />}
    {modal?.type === 'detail' && <ExpenseDetail group={group} expense={modal.expense} onClose={() => setModal(null)} onEdit={() => setModal({ type: 'expense', expense: modal.expense })} onDelete={() => setModal({ type: 'deleteExpense', expense: modal.expense })} />}
    {modal?.type === 'deleteExpense' && <ConfirmDialog title="¿Quitamos este gasto?" message={`Se eliminará “${modal.expense.title}” y se recalcularán los balances.`} onClose={() => setModal({ type: 'detail', expense: modal.expense })} onConfirm={() => { updateGroup({ ...group, expenses: group.expenses.filter(exp => exp.id !== modal.expense.id) }); setModal(null); setToast('Gasto eliminado. Balances actualizados.'); }} />}
    {modal?.type === 'deleteGroup' && <ConfirmDialog title="¿Eliminar este grupo?" message={`“${group.name}” y todos sus movimientos se eliminarán de este dispositivo. Puedes descargar un respaldo antes desde Tu espacio.`} onClose={() => setModal(null)} onConfirm={() => { const groups = state.groups.filter(g => g.id !== group.id); setState({ ...state, groups, activeGroupId: groups[0]?.id || null }); setModal(null); setToast('Grupo eliminado.'); }} />}
    {modal?.type === 'deletePayment' && <ConfirmDialog title="¿Eliminar este pago?" message="Los balances volverán a incluir el importe de este pago." onClose={() => setModal(null)} onConfirm={() => { updateGroup({ ...group, settlements: group.settlements.filter(p => p.id !== modal.payment.id) }); setModal(null); setToast('Pago eliminado.'); }} />}
    {modal?.type === 'import' && <ConfirmDialog title="Tu respaldo está listo." message={`Se importarán ${modal.data.groups.length} grupos. Esto reemplazará los datos actuales de este dispositivo. Descarga un respaldo primero si quieres conservarlos.`} label="Importar respaldo" onClose={() => setModal(null)} onConfirm={() => { setState(modal.data); setView('groups'); setTab('expenses'); setQuery(''); setCategory('all'); setModal(null); setToast('Respaldo importado. Todo en su lugar.'); }} />}
    {modal?.type === 'data' && <Modal title="Tus planes, a salvo." subtitle="Tus datos son tuyos. Guárdalos y llévalos contigo." onClose={() => setModal(null)}><div className="data-options"><button onClick={exportJSON}><span className="category-icon mint"><FileJson size={22} /></span><span><strong>Descargar un respaldo</strong><small>Todos tus grupos, gastos y pagos en JSON</small></span><Download size={19} /></button><button onClick={() => { setModal(null); importRef.current.click(); }}><span className="category-icon lavender"><Upload size={22} /></span><span><strong>Importar un respaldo</strong><small>Recupera tus datos en este dispositivo</small></span><ChevronRight size={19} /></button></div><p className="info-note"><ShieldCheck size={19} />Entre guarda los datos en este navegador. No hay cuentas ni sincronización automática. Descarga respaldos para conservarlos o moverlos a otro dispositivo.</p><div className="data-stats"><span><strong>{state.groups.length}</strong> grupos</span><span><strong>{state.groups.reduce((sum, g) => sum + g.expenses.length, 0)}</strong> gastos</span><span><strong>{state.groups.reduce((sum, g) => sum + g.settlements.length, 0)}</strong> pagos</span></div></Modal>}
    {modal?.type === 'help' && <Modal title="Compartir, así de fácil." subtitle="Tres pasos para que las cuentas no se interpongan." onClose={() => setModal(null)}><div className="help-steps">{[['01', 'Armen el grupo', 'Ponle nombre al plan y añade a las personas que lo comparten.'], ['02', 'Anoten los gastos', 'Elige quién pagó y reparte por igual o con importes exactos.'], ['03', 'Queden a mano', 'Entre calcula quién debe a quién. Registren los pagos que hagan por fuera.']].map(([n, title, text]) => <div key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><p className="info-note"><ShieldCheck size={19} />Los datos se guardan solo en este navegador. En Tu espacio puedes descargar e importar respaldos. Los grupos iniciales contienen datos de ejemplo; crea uno propio o elimina los ejemplos.</p><button className="button primary full-width" onClick={() => setModal(null)}>Vamos al plan<ArrowRight size={17} /></button></Modal>}
  </div>;
}
