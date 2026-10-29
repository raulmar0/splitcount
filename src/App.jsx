import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Plus, Search, ChevronDown, ChevronRight, X, CheckCheck, Download, Upload, Settings2, LayoutGrid, HelpCircle, Leaf, MoreHorizontal, Utensils, Car, BedDouble, ShoppingBag, Sparkles, ReceiptText, ArrowLeftRight, Trash2, Pencil, ShieldCheck, Coffee, FileJson, CircleCheck, SlidersHorizontal, Share2, Cloud, CloudOff, UserRound, ArrowLeft, Filter, Settings } from 'lucide-react';
import { calculateBalances, suggestSettlements, formatMoney, parseMoney, validateState, isDate } from './domain.js';
import GroupForm from './GroupForm.jsx';
import CustomSelect from './CustomSelect.jsx';
import Modal from './Modal.jsx';
import ExpenseForm from './ExpenseForm.jsx';
import useAppNavigation from './useAppNavigation.js';
import { HomeScreen, SettingsScreen, TransferList } from './Screens.jsx';
import { ShareDialog, IdentityDialog, JoinDialog } from './Sharing.jsx';
import { loadTheme, saveTheme } from './themes.js';
import useGroupSync from './useGroupSync.js';
import useGoogleAuth from './useGoogleAuth.js';
import useAccountSync from './useAccountSync.js';
import { asGuestWorkspace, loadWorkspace, saveWorkspace } from './workspace-storage.js';
import AuthContext from './AuthContext.js';
import AccountImportDialog from './AccountImportDialog.jsx';
import InstallBanner from './InstallBanner.jsx';
import { assertSharedGroupCapacity, countSharedGroups, sharedCreationId } from './group-limits.js';
import { workspaceAccess } from './workspace-access.js';
import { useI18n } from './i18n.jsx';
import { translate as t, getLocale } from './i18n.js';

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
const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }).replace('.', '');
const fullDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
const memberName = (group, id) => group.members.find(m => m.id === id)?.name || t("Integrante");

function Avatar({ member, index = 0, small = false }) {
  return <span className={`avatar avatar-${index % 5} ${small ? 'small' : ''}`} title={member.name}>{member.name.slice(0, 1).toUpperCase()}</span>;
}

function PaymentForm({ group: sourceGroup, transfer, onSave, onClose }) {
  const [group] = useState(() => sourceGroup);
  const [from, setFrom] = useState(transfer?.from || group.members[0].id);
  const [to, setTo] = useState(transfer?.to || group.members[1].id);
  const [amount, setAmount] = useState(transfer ? moneyInput(transfer.amount) : '');
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftId] = useState(() => uid());
  async function submit(e) {
    e.preventDefault(); const cents = parseMoney(amount);
    if (from === to) return setError(t("Elige dos personas diferentes."));
    if (!cents || cents > 10000000000) return setError(t("Introduce un importe válido mayor a cero (máximo 100 millones)."));
    if (!isDate(date)) return setError(t("Elige una fecha válida."));
    setError(''); setBusy(true);
    try { await onSave({ id: draftId, from, to, amount: cents, date }); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <Modal title={t("Registrar un pago")} subtitle={t("Registra un pago que ya se hizo fuera de Splitcount.")} onClose={onClose} closeDisabled={busy}>
    <form onSubmit={submit} className="form-stack"><div className="form-grid"><label htmlFor="payment-from">{t("Quién pagó")}<CustomSelect id="payment-from" aria-label={t("Quién pagó")} value={from} onChange={setFrom} options={group.members.map(m => ({value:m.id,label:m.name}))} /></label><label htmlFor="payment-to">{t("A quién")}<CustomSelect id="payment-to" aria-label={t("A quién")} value={to} onChange={setTo} options={group.members.map(m => ({value:m.id,label:m.name}))} /></label></div>
      <div className="amount-field"><span>{group.currency}</span><input autoFocus aria-label={t("Importe del pago")} required inputMode="decimal" value={amount} placeholder="0.00" onChange={e => setAmount(e.target.value)} /></div>
      <label>{t("Fecha del pago")}<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
      <p className="info-note"><ShieldCheck size={18} />{t("Splitcount lleva el registro. El dinero se transfiere por el medio que ustedes prefieran.")}</p>
      {error && <p role="alert" className="form-error">{t(error)}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("Cancelar")}</button><button className="button primary" type="submit" disabled={busy}><CheckCheck size={18} />{busy ? t("Guardando…") : t("Registrar pago")}</button></div>
    </form>
  </Modal>;
}

function ExpenseDetail({ group, expense, onClose, onEdit, onDelete }) {
  const cat = CATEGORIES[expense.category] || CATEGORIES.other; const Icon = cat.icon;
  return <Modal title={expense.title} subtitle={`${t(cat.name)} · ${fullDate(expense.date)}`} onClose={onClose}>
    <div className="detail-total"><div className={`category-icon ${cat.color}`}><Icon size={26} /></div><strong>{formatMoney(expense.amount, group.currency)}</strong><span className="muted">{t('Pagó {name}', { name: memberName(group, expense.paidBy) })} · {group.currency}</span></div>
    <h3>{t("Así se repartió")}</h3><div className="split-members">{expense.participants.map(id => { const index = group.members.findIndex(m => m.id === id); return <div className="split-member" key={id}><span className="person-label"><Avatar member={group.members[index]} index={index} small />{memberName(group, id)}</span><strong>{formatMoney(expense.shares[id], group.currency)}</strong></div>; })}</div>
    {expense.note && <p className="detail-note">{expense.note}</p>}
    <div className="modal-actions spread"><button className="text-button danger" onClick={onDelete}><Trash2 size={17} />{t("Eliminar gasto")}</button><button className="button primary" onClick={onEdit}><Pencil size={16} />{t("Editar gasto")}</button></div>
  </Modal>;
}

function ConfirmDialog({ title, message, label = t("Eliminar"), onConfirm, onClose }) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function confirm() { setBusy(true);setError('');try { await onConfirm(); } catch(error) {setError(error.message);} finally {setBusy(false);} }
  return <Modal title={title} onClose={onClose} closeDisabled={busy}><p className="confirm-message">{message}</p>{error && <p className="form-error" role="alert">{t(error)}</p>}<div className="modal-actions"><button className="button secondary" onClick={onClose} disabled={busy}>{t("Cancelar")}</button><button className="button destructive" onClick={confirm} disabled={busy}>{busy ? t("Guardando…") : label}</button></div></Modal>;
}

function EmptyState({ onAdd, filtered }) {
  return <div className="empty-state"><span className="empty-icon"><ReceiptText size={30} /></span><h3>{filtered ? t("Por aquí no hay coincidencias.") : t("El plan empieza aquí.")}</h3><p>{filtered ? t("Prueba con otro nombre o cambia la categoría.") : t("Añade el primer gasto y empieza a compartir.")}</p>{!filtered && <button className="button primary" onClick={onAdd}><Plus size={17} />{t("Añadir primer gasto")}</button>}</div>;
}

export default function App() {
  useI18n();
  const auth = useGoogleAuth();
  return <AuthContext.Provider value={auth}><Workspace key={workspaceAccess(auth).key} auth={auth} /></AuthContext.Provider>;
}

function Workspace({ auth }) {
  const { accountId, canSyncAccount, pendingApproval, groupSyncEnabled, groupSyncSignal } = workspaceAccess(auth);
  const approvalBlocked = !!accountId && !!auth.session && !canSyncAccount;
  const disabledReason = approvalBlocked ? { code: auth.access?.status === 'rejected' ? 'account_rejected' : 'account_pending', message: auth.access?.status === 'rejected' ? t("Esta cuenta no tiene autorización para sincronizar. Puedes seguir usando grupos locales.") : t("Tu cuenta espera aprobación del administrador. Puedes seguir usando grupos locales.") } : undefined;
  const [state, setState] = useState(() => loadWorkspace(accountId));
  const [theme, setTheme] = useState(() => loadTheme());
  const [tab, setTab] = useState('expenses');
  const overlayHistory = useRef(null);
  const { screen, navigate, openGroup, goBack } = useAppNavigation({state,setState,onPop:handleOverlayBack});
  const adminIntentHandled = useRef(false);
  useEffect(() => {
    if (!adminIntentHandled.current && new URLSearchParams(globalThis.location?.search).get('admin') === '1') {
      adminIntentHandled.current = true;
      navigate('settings', { replace: true });
    }
    const openAdmin = event => { if (event.data?.type === 'OPEN_ADMIN_DASHBOARD') navigate('settings'); };
    globalThis.navigator?.serviceWorker?.addEventListener('message', openAdmin);
    return () => globalThis.navigator?.serviceWorker?.removeEventListener('message', openAdmin);
  }, [navigate]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recent');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [filtersOpen,setFiltersOpen] = useState(false);
  const [groupMenu, setGroupMenu] = useState(false);
  const importRef = useRef(null);
  const group = state.groups.find(g => g.id === state.activeGroupId) || state.groups[0];
  const balances = useMemo(() => group ? calculateBalances(group) : {}, [group]);
  const transfers = useMemo(() => group ? suggestSettlements(group) : [], [group]);
  const total = group?.expenses.reduce((sum, exp) => sum + exp.amount, 0) || 0;
  const me = group?._shared ? group._selfId : group?.members.find(m => m.id === 'you')?.id || group?.members[0]?.id;
  const myBalance = balances[me] || 0;
  useEffect(() => { setStorageError(!saveWorkspace(state, accountId)); }, [state, accountId]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!groupMenu) return; const close = () => setGroupMenu(false); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, [groupMenu]);
  const registerSharedRef = useRef(null);
  const { status: syncStatus, error: syncError, joinState, joinGroup, dismissJoin, retrySync, saveGroup, shareGroup } = useGroupSync({ state, setState, enabled: groupSyncEnabled, disabledReason, signal: groupSyncSignal, registerShared: accountId ? (remote, options) => registerSharedRef.current(remote, options) : undefined, onJoined: remote => { openGroup(remote.id,{replace:true}); setTab('expenses'); setQuery(''); setCategory('all'); setModal(remote._selfId ? null : { type: 'identity' }); } });
  const accountSync = useAccountSync({ auth, state, setState, paused: !!modal || !!joinState });
  registerSharedRef.current = accountSync.registerShared;
  if(modal || filtersOpen || joinState) overlayHistory.current={state:globalThis.history?.state,url:globalThis.location?.href};
  function handleOverlayBack() {
    if(!modal && !filtersOpen && !joinState)return true;
    const snapshot=overlayHistory.current;
    if(snapshot)globalThis.history?.pushState(snapshot.state,'',snapshot.url);
    if(globalThis.document?.querySelector('dialog[open][data-close-disabled="true"]'))return false;
    setModal(null);setFiltersOpen(false);dismissJoin();return false;
  }
  const updateGroup = (updated, before = group) => saveGroup(updated, before);
  useEffect(() => { document.documentElement.dataset.theme = theme; saveTheme(theme); }, [theme]);
  const syncLabel = group?._shared ? ({synced:t("Grupo sincronizado"),pending:t("Sincronizando…"),offline:t("Sin conexión"),error:t("No se pudo sincronizar")}[syncStatus] || t("Conectando…")) : storageError ? t("Cambios sin guardar") : t("Guardado en este dispositivo");
  function openExpenseFor(selected) { openGroup(selected.id); setTab('expenses'); setModal(selected._shared && !selected._selfId ? {type:'identity',afterIdentity:'expense'} : {type:'expense',baseGroup:selected}); }
  function addExpense() { if(screen !== 'group') {setModal(state.groups.length ? {type:'chooseGroup'} : {type:'group'});return;} setModal(group._shared && !group._selfId ? {type:'identity',afterIdentity:'expense'} : {type:'expense',baseGroup:group}); }
  async function chooseIdentity(id) { const chosen=accountId ? await accountSync.chooseIdentity(group,id) : {...group,_selfId:id};if(!accountId)setState(current => ({...current,groups:current.groups.map(item => item.id === group.id ? {...item,_selfId:id} : item)}));setModal(modal?.afterIdentity === 'expense' ? {type:'expense',baseGroup:chosen} : null); }
  async function addIdentity(name) { const id=uid();const saved=await updateGroup({...group,members:[...group.members,{id,name}]});const chosen=accountId ? await accountSync.chooseIdentity(saved,id) : {...saved,_selfId:id};if(!accountId)setState(current => ({...current,groups:current.groups.map(item => item.id === group.id ? {...item,_selfId:id} : item)}));setModal(modal?.afterIdentity === 'expense' ? {type:'expense',baseGroup:chosen} : null); }
  function selectGroup(id) {openGroup(id);setTab('expenses');setQuery('');setCategory('all');setFiltersOpen(false);}
  function exportFile(data, filename, type) { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportJSON() { exportFile(JSON.stringify(state, null, 2), 'splitcount-respaldo.json', 'application/json'); setToast(t("Respaldo descargado. Tus planes, a salvo.")); }
  function exportCSV() {
    const escape = value => { const text = String(value ?? ''); return `"${/^[=+\-@\t\r]/.test(text) ? "'" : ''}${text.replaceAll('"', '""')}"`; };
    const rows = [[t("Fecha"), t("Descripción"), t("Categoría"), t("Pagó"), t("Importe"), t("Moneda"), ...group.members.map(m => t('Parte de {name}', { name: m.name }))], ...group.expenses.map(exp => [exp.date, exp.title, t((CATEGORIES[exp.category] || CATEGORIES.other).name), memberName(group, exp.paidBy), moneyInput(exp.amount), group.currency, ...group.members.map(m => moneyInput(exp.shares[m.id] || 0))])];
    exportFile('\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n'), `splitcount-${group.name.replace(/[^\p{L}\p{N}]/gu, '-')}.csv`, 'text/csv;charset=utf-8'); setToast(t("Gastos exportados a CSV."));
  }
  async function importJSON(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 5_000_000) return setToast(t("El respaldo debe pesar menos de 5 MB."));
    let data;
    try { data = JSON.parse(await file.text()); if (!validateState(data)) throw new Error('invalid'); } catch { setToast(t("Este archivo no es un respaldo válido de Splitcount.")); return; }
    try {
      if (!accountId) assertSharedGroupCapacity([], data.groups.filter(item => item._shared).map(item => item.id));
      setModal({ type: 'import', data: accountId ? data : asGuestWorkspace(data) });
    } catch (error) { setToast(error.message); }
  }
  const filteredExpenses = useMemo(() => group ? group.expenses.filter(exp => (category === 'all' || exp.category === category) && `${exp.title} ${memberName(group, exp.paidBy)} ${exp.note}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 'amount' ? b.amount - a.amount : b.date.localeCompare(a.date)) : [], [group, category, query, sort]);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => {e.preventDefault();navigate('groups');}} aria-label={t("Splitcount, inicio")}><img className="brand-image" src={`${import.meta.env.BASE_URL}brand/splitcount-symbol.png`} alt="" width="36" height="36" />Splitcount</a>

      <nav className="main-nav" aria-label={t("Navegación principal")}><button className={screen === 'groups' || screen === 'group' ? 'active' : ''} onClick={() => navigate('groups')}><LayoutGrid size={19} />{t("Tus grupos")}</button><button className={screen === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings size={19} />{t("Ajustes")}</button></nav>
      <div className="sidebar-section"><span>{t("Tus grupos")}</span><button className="icon-button" aria-label={t("Crear grupo")} onClick={() => { setModal({ type: 'group' }); }}><Plus size={17} /></button></div>
      <div className="group-nav">{state.groups.map(g => <button key={g.id} className={g.id === group?.id ? 'selected' : ''} onClick={() => selectGroup(g.id)}><span className={`group-emoji ${g.id === 'oaxaca' ? 'sand' : g.id === 'casa' ? 'sage' : 'rose'}`}>{g.name.split(' ').filter(word => word.length > 2).slice(0,2).map(word => word[0]).join('')}</span><span>{g.name}</span>{g.id === group?.id && <span className="selected-dot" />}</button>)}</div>
      <button className="new-group" onClick={() => { setModal({ type: 'group' }); }}><Plus size={16} />{t("Crear un grupo")}</button>
      <div className="sidebar-bottom"><button className="help-link" onClick={() => setModal({ type: 'help' })}><HelpCircle size={18} />{t("Cómo funciona")}<ArrowUpRight size={15} /></button><button className="profile" onClick={() => navigate('settings')}><span className="avatar profile-avatar">{auth.account?.name?.slice(0,1).toUpperCase() || 'T'}</span><span><strong>{auth.account?.name || t("Tu espacio")}</strong><small>{accountId ? t("Grupos en tu cuenta") : pendingApproval ? t("Cuenta pendiente · modo invitado") : t("Modo invitado")}</small></span><Settings2 size={17} /></button></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-start">{screen === 'group' && <button className="icon-button mobile-back" aria-label={t("Volver")} onClick={goBack}><ArrowLeft size={22} /></button>}<button className="mobile-brand" aria-label={t("Splitcount, ir a grupos")} onClick={() => navigate('groups')}><img className="brand-image" src={`${import.meta.env.BASE_URL}brand/splitcount-symbol.png`} alt="" width="32" height="32" /><span>Splitcount</span></button><div className="breadcrumb desktop-only"><span>{screen === 'group' ? t("Tus grupos") : screen === 'groups' ? t("Tus grupos") : t("Ajustes")}</span>{screen === 'group' && group && <><ChevronRight size={15} /><strong>{group.name}</strong></>}</div></div><div className="topbar-actions">{screen === 'group' && <span className={`sync-status ${syncStatus === 'offline' || syncStatus === 'error' ? 'error' : syncStatus === 'pending' ? 'pending' : ''}`}><span />{t(syncLabel)}</span>}<button className="icon-button desktop-only" onClick={() => navigate('settings')} aria-label={t("Respaldos y ajustes")}><Settings2 size={19} /></button></div></header>
      <main>
        <InstallBanner />
        {approvalBlocked && screen !== 'settings' && <div className="sync-error-banner" role="status">{t(disabledReason.message)}<button onClick={() => navigate('settings')}>{t("Ver mi cuenta")}</button></div>}
        {accountId && !auth.session && <div className="sync-error-banner" role="status">{t("Tu sesión venció. Conservamos tus grupos y formularios.")}<button onClick={() => navigate('settings')}>{t("Volver a iniciar sesión")}</button></div>}
        {accountId && auth.session && accountSync.error && screen !== 'settings' && <div className="sync-error-banner" role="status">{t(accountSync.error)}<button onClick={() => { void accountSync.refresh(); }}>{t("Reintentar")}</button></div>}
        {accountId && accountSync.status === 'pending' && screen === 'groups' && <p className="account-loading" role="status">{t("Recuperando tus grupos de la cuenta…")}</p>}
        {storageError && <div className="storage-warning" role="alert">{t("No se pudieron guardar los cambios en este navegador. Descarga un respaldo antes de salir.")}<button onClick={exportJSON}>{t("Descargar respaldo")}</button></div>}
        {screen === 'groups' ? <HomeScreen groups={state.groups} onOpen={selectGroup} onCreate={() => setModal({type:'group'})} /> : screen === 'settings' ? <SettingsScreen theme={theme} onTheme={setTheme} onExport={exportJSON} onImport={() => importRef.current.click()} onHelp={() => setModal({type:'help'})} auth={auth} accountSync={accountSync} count={state.groups.length} sharedCount={countSharedGroups(state.groups)} onAddLocal={() => setModal({type:'accountImport',groups:loadWorkspace(null).groups})} /> : group ? <>
          <div className="page-intro"><div><h1>{group.name}</h1>{group.description && <p className="group-subtitle">{group.description}</p>}</div><div className="group-title-actions"><button className="button secondary share-button" onClick={() => setModal({ type: 'share' })}><Share2 size={17} /><span>{t("Compartir")}</span></button><button className="button primary add-top" onClick={addExpense}><Plus size={18} /><span>{t("Añadir gasto")}</span></button></div></div>
          {group._shared && (syncStatus === 'offline' || syncStatus === 'error') && <div className="sync-error-banner" role="status"><CloudOff size={17} /><span>{t(syncError) || t("Mostrando la última copia del grupo.")}</span><button onClick={retrySync}>{t("Reintentar")}</button></div>}
          <section className="group-cover" aria-label={t('Integrantes de {name}', { name: group.name })}>
            <div className="cover-content"><div className="cover-members"><div className="avatar-stack">{group.members.slice(0,5).map((m,i) => <Avatar key={m.id} member={m} index={i} small />)}</div><span>{t('{count} integrantes', { count: group.members.length })} · {group.currency}</span>{group.isDemo && <span className="demo-badge">{t("Ejemplo")}</span>}{group._shared && <><span className="shared-badge"><Cloud size={14} />{t("Compartido")}</span><button className="identity-selector" onClick={() => setModal({type:'identity'})}><UserRound size={15} />{me ? t('Soy {name}', { name: memberName(group,me) }) : t("Elegir mi nombre")}<ChevronDown size={13} /></button></>}</div></div>
            <div className="cover-options"><button className="cover-menu-button" aria-label={t("Opciones del grupo")} aria-expanded={groupMenu} onClick={e => { e.stopPropagation(); setGroupMenu(!groupMenu); }}><MoreHorizontal size={22} /></button>{groupMenu && <div className="dropdown"><button onClick={() => setModal({ type: 'group', group })}><Pencil size={16} />{t("Editar grupo y personas")}</button><button onClick={exportCSV}><Download size={16} />{t("Exportar gastos CSV")}</button><button className="danger" onClick={() => setModal({ type: 'deleteGroup' })}><Trash2 size={16} />{group._shared ? t("Salir del grupo") : t("Eliminar grupo")}</button></div>}</div>
          </section>

          <div className="summary-cards"><div className="summary-card balance-card"><div className="summary-label"><span>{t("Tu balance")}</span></div><div className={`big-value ${myBalance > 0 ? 'positive' : myBalance < 0 ? 'negative' : ''}`}>{me ? <>{myBalance > 0 ? '+' : myBalance < 0 ? '−' : ''}{formatMoney(Math.abs(myBalance), group.currency)}<span>{group.currency}</span></> : <button className="text-button" onClick={() => setModal({type:'identity'})}>{t("Elegir mi nombre")}</button>}</div><p><span className={`tiny-dot ${myBalance < 0 ? 'orange' : ''}`} />{!me ? t("Selecciona tu nombre para ver tu saldo.") : myBalance > 0 ? t("Te deben en este grupo.") : myBalance < 0 ? t("Tienes una cuenta por saldar.") : t("Estás al día.")}</p></div><div className="summary-card"><div className="summary-label"><span>{t("Total del grupo")}</span></div><div className="big-value">{formatMoney(total, group.currency)}<span>{group.currency}</span></div><p>{group.expenses.length} {group.expenses.length === 1 ? t("gasto compartido") : t("gastos compartidos")} <span className="muted">{t('entre {count} personas', { count: group.members.length })}</span></p></div><div className="summary-card per-person"><div className="summary-label"><span>{t("Gasto promedio")}</span></div><div className="big-value">{formatMoney(Math.round(total / group.members.length), group.currency)}<span>{group.currency}</span></div><p>{t("Por persona")}{" "}<span className="muted">{t("· en este grupo")}</span></p></div></div>

          <div className="content-grid"><section className="main-panel">
            <><div className="panel-tabs" role="tablist" aria-label={t("Vista del grupo")}>{[['expenses', t("Gastos"), ReceiptText], ['balances', t("Saldos"), ArrowLeftRight]].map(([id, label, Icon]) => <button role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}><Icon size={17} />{t(label)}{id === 'expenses' && <span className="tab-count">{group.expenses.length}</span>}</button>)}<span className="tab-filler" /><button className="icon-button export-button" onClick={exportCSV} aria-label={t("Exportar gastos a CSV")}><Download size={18} /></button></div>
              {tab === 'expenses' && <><div className="expense-toolbar"><div className="search-field"><Search size={17} /><input aria-label={t("Buscar gastos")} placeholder={t("Buscar un gasto...")} value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-button" aria-label={t("Limpiar búsqueda")} onClick={() => setQuery('')}><X size={14} /></button>}</div><label className="filter-field desktop-only"><SlidersHorizontal size={15} /><CustomSelect aria-label={t("Filtrar por categoría")} value={category} onChange={setCategory} options={[{value:"all",label:t("Todas las categorías")},...Object.entries(CATEGORIES).map(([value,cat]) => ({value,label:t(cat.name)}))]} /></label><button className="icon-button filter-toggle" aria-label={t("Filtrar y ordenar gastos")} onClick={() => setFiltersOpen(true)}><Filter size={19} />{category !== 'all' && <span className="filter-dot" />}</button></div>
                <div className="list-heading"><span>{query || category !== 'all' ? t('{count} resultados', { count: filteredExpenses.length }) : t("Todos los gastos")}</span><label className="desktop-only"><CustomSelect aria-label={t("Ordenar gastos")} value={sort} onChange={setSort} options={[{value:"recent",label:t("Más recientes")},{value:"amount",label:t("Mayor importe")}]} /></label></div>
                {filteredExpenses.length ? <div className="expense-list">{filteredExpenses.map(exp => { const cat = CATEGORIES[exp.category] || CATEGORIES.other; const Icon = exp.id === 'cafe' ? Coffee : cat.icon; const net = (exp.paidBy === me ? exp.amount : 0) - (exp.shares[me] || 0); return <button className="expense-row" key={exp.id} onClick={() => setModal({ type: 'detail', expense: exp, baseGroup: group })}><span className={`category-icon ${cat.color}`}><Icon size={21} strokeWidth={1.7} /></span><span className="expense-info"><strong>{exp.title}</strong><span><span className="payer">{exp.paidBy === me ? t("Pagaste tú") : t('{name} pagó', { name: memberName(group, exp.paidBy) })}</span><span className="dot-separator">·</span>{dateLabel(exp.date)}</span></span><span className="expense-amount"><strong>{formatMoney(exp.amount, group.currency)}</strong><span className={net > 0 ? 'positive' : net < 0 ? 'negative' : 'muted'}>{net > 0 ? t('te deben {amount}', { amount: formatMoney(net, group.currency) }) : net < 0 ? t('debes {amount}', { amount: formatMoney(-net, group.currency) }) : me ? t("sin saldo para ti") : t('{count} participantes', { count: exp.participants.length })}</span></span><ChevronRight className="row-chevron" size={16} /></button>; })}</div> : <EmptyState onAdd={addExpense} filtered={!!query || category !== 'all'} />}
                {!!filteredExpenses.length && <div className="list-footer"><span>{query || category !== 'all' ? t("Total filtrado") : t("Todos los gastos registrados.")}</span>{query || category !== 'all' ? <strong>{formatMoney(filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0), group.currency)}</strong> : <span className="footer-check"><CheckCheck size={15} />{group.expenses.length} {group.expenses.length === 1 ? t("gasto") : t("gastos")}</span>}</div>}
              </>}
              {tab === 'balances' && <div className="tab-content"><div className="mobile-settlements"><TransferList group={group} transfers={transfers} onPayment={transfer => setModal({type:'payment',transfer,baseGroup:group})} /></div><div className="section-title"><div><h3>{t("Así van las cuentas")}</h3><p>{t("Lo que cada persona recibe o debe al grupo.")}</p></div><button className="button secondary small-button" onClick={() => setModal({ type: 'payment', baseGroup:group })}><Plus size={15} />{t("Pago")}</button></div><div className="balances-list">{group.members.map((m, i) => <div className="member-balance" key={m.id}><Avatar member={m} index={i} /><div><strong>{m.name}</strong><small>{balances[m.id] > 0 ? t("Recibe del grupo") : balances[m.id] < 0 ? t("Debe al grupo") : t("Está al día")}</small></div><strong className={balances[m.id] > 0 ? 'positive' : balances[m.id] < 0 ? 'negative' : ''}>{balances[m.id] > 0 ? '+' : balances[m.id] < 0 ? '−' : ''}{formatMoney(Math.abs(balances[m.id]), group.currency)}</strong></div>)}</div>
                {group.settlements.length > 0 && <><h3 className="subsection-title">{t("Pagos registrados")}</h3>{group.settlements.map(payment => <div className="payment-row" key={payment.id}><span className="payment-icon"><CheckCheck size={19} /></span><div><strong>{memberName(group, payment.from)} → {memberName(group, payment.to)}</strong><small>{dateLabel(payment.date)}</small></div><strong>{formatMoney(payment.amount, group.currency)}</strong><button className="icon-button" aria-label={t('Eliminar pago de {name}', { name: memberName(group, payment.from) })} onClick={() => setModal({ type: 'deletePayment', payment })}><Trash2 size={15} /></button></div>)}</>}
              </div>}
            </>
          </section>

          <aside className="right-panel"><section className="settle-card"><div className="card-title"><h3>{t("Para quedar a mano")}</h3><span className="mini-icon"><ArrowLeftRight size={17} /></span></div><p className="card-subtitle">{t("Menos transferencias, mismas cuentas.")}</p>{transfers.length ? <div className="transfers">{transfers.map((transfer, i) => <div className="transfer" key={`${transfer.from}-${transfer.to}-${i}`}><div className="transfer-people"><Avatar member={group.members.find(m => m.id === transfer.from)} index={group.members.findIndex(m => m.id === transfer.from)} small /><span><strong>{memberName(group, transfer.from)}</strong><ArrowRight size={12} /><strong>{memberName(group, transfer.to)}</strong></span></div><div className="transfer-bottom"><strong>{formatMoney(transfer.amount, group.currency)}</strong><button onClick={() => setModal({ type: 'payment', transfer, baseGroup:group })}>{t("Registrar pago")}<ArrowUpRight size={13} /></button></div></div>)}</div> : <div className="all-settled"><CircleCheck size={37} /><strong>{t("¡Están a mano!")}</strong><p>{t("Las cuentas claras se sienten bien.")}</p></div>}<button className="button secondary full-width settle-button" onClick={() => setModal({ type: 'payment', baseGroup:group })}><CheckCheck size={17} />{t("Registrar un pago")}</button><div className="settle-footnote"><Leaf size={13} />{t("Sin vueltas. Sin cuentas pendientes.")}</div></section>
          <section className="members-card"><div className="card-title"><h3>{t("Integrantes")}</h3><button className="icon-button" aria-label={t("Editar integrantes")} onClick={() => setModal({ type: 'group', group })}><Plus size={17} /></button></div><div className="members-preview">{group.members.slice(0, 5).map((m, i) => <div key={m.id}><Avatar member={m} index={i} /><span>{m.name}</span></div>)}</div>{group.members.length > 5 && <p className="extra-members">{t('Y {count} personas más', { count: group.members.length - 5 })}</p>}</section>
          </aside></div>

        </> : <div className="welcome-empty"><h1>{t("Crea tu primer grupo")}</h1><p>{t("Viajes, cenas o el depa. Comparte los momentos")}<br />{t("y reparte los gastos sin complicaciones.")}</p><button className="button primary" onClick={() => setModal({ type: 'group' })}><Plus size={18} />{t("Crear mi primer grupo")}</button><button className="text-button" onClick={() => importRef.current.click()}><Upload size={16} />{t("Importar un respaldo")}</button></div>}
      </main>
    </div>

    <nav className="mobile-bottom-nav" aria-label={t("Navegación inferior")}><button className="nav-item" aria-current={screen === 'groups' || screen === 'group' ? 'page' : undefined} onClick={() => navigate('groups')}><LayoutGrid size={21} /><span>{t("Grupos")}</span></button><button className="nav-item nav-add" onClick={addExpense}><Plus size={23} /><span>{t("Gasto")}</span></button><button className="nav-item" aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}><Settings size={21} /><span>{t("Ajustes")}</span></button></nav>
    {modal?.type === 'chooseGroup' && <Modal title={t("¿En qué grupo fue el gasto?")} onClose={() => setModal(null)}><div className="share-identity">{state.groups.map(item => <button className="identity-choice" key={item.id} onClick={() => openExpenseFor(item)}><span className="avatar">{item.name.slice(0,1)}</span><strong>{item.name}</strong><ArrowRight size={18} /></button>)}</div></Modal>}
    {filtersOpen && <Modal title={t("Filtrar y ordenar")} onClose={() => setFiltersOpen(false)}><form className="form-stack filter-form" onSubmit={event => {event.preventDefault();setFiltersOpen(false);}}><label>{t("Categoría")}<CustomSelect aria-label={t("Categoría del filtro")} value={category} onChange={setCategory} options={[{value:"all",label:t("Todas las categorías")},...Object.entries(CATEGORIES).map(([value,cat]) => ({value,label:t(cat.name)}))]} /></label><label>{t("Orden")}<CustomSelect aria-label={t("Orden del filtro")} value={sort} onChange={setSort} options={[{value:"recent",label:t("Más recientes")},{value:"amount",label:t("Mayor importe")}]} /></label><div className="flow-actions"><button className="button secondary" type="button" onClick={() => {setCategory('all');setSort('recent');}}>{t("Restablecer")}</button><button className="button primary" type="submit">{t("Ver resultados")}</button></div></form></Modal>}

    <input className="visually-hidden" type="file" accept="application/json,.json" ref={importRef} onChange={importJSON} aria-label={t("Importar respaldo JSON")} tabIndex={-1} />
    {toast && <div className="toast" role="status"><CircleCheck size={19} /><span>{t(toast)}</span><button aria-label={t("Cerrar aviso")} onClick={() => setToast('')}><X size={16} /></button></div>}
    {joinState && <JoinDialog error={joinState.error} onRetry={() => joinGroup()} onClose={dismissJoin} />}
    {modal?.type === 'share' && group && <ShareDialog inviteMemberIds={modal.inviteMemberIds} pendingApproval={pendingApproval} group={group} blockedReason={disabledReason?.message} alreadyRegistered={!!accountId && sharedCreationId(state.groups,group.id) !== group.id} sharedCount={countSharedGroups(state.groups)} signedIn={!!accountId} onSignIn={() => {setModal(null);navigate('settings');}} onClose={() => setModal(null)} onShare={async (name,selfId) => { const shared=accountId ? await accountSync.createGroup({...group,_selfId:selfId,members:group.members.map(member => member.id === selfId ? {...member,name} : member)}) : await shareGroup(group,name,selfId);openGroup(shared.id,{replace:true});setToast(t("El grupo ya se puede compartir.")); }} />}
    {modal?.type === 'identity' && group && <IdentityDialog group={group} onChoose={chooseIdentity} onAdd={addIdentity} onClose={() => setModal(null)} />}
    {modal?.type === 'expense' && group && <ExpenseForm group={modal.baseGroup || group} expense={modal.expense} onClose={() => setModal(null)} onSave={async expense => { const base = modal.baseGroup || group; await updateGroup({ ...base, expenses: modal.expense ? base.expenses.map(exp => exp.id === expense.id ? expense : exp) : [expense, ...base.expenses] },base); setModal(null); setToast(modal.expense ? t("Gasto actualizado.") : t("Gasto añadido.")); }} />}
    {modal?.type === 'group' && <GroupForm pendingApproval={pendingApproval} canShare={canSyncAccount} group={modal.group} selfName={auth.account?.name} signedIn={!!accountId} accountGroups={state.groups} sharedCount={countSharedGroups(state.groups)} onClose={() => setModal(null)} onSave={async (saved,storage, {inviteMemberIds = []} = {}) => { let result=saved;if(modal.group) { result=await updateGroup(saved,modal.group); } else if(accountId && storage === 'shared') { assertSharedGroupCapacity(state.groups,[sharedCreationId(state.groups,saved.id)],true);result=await accountSync.createGroup(saved); } else if(accountId) { result=accountSync.addLocalGroup(saved); } else { setState(s => ({ ...s, activeGroupId: saved.id, groups: [...s.groups, saved] })); } openGroup(result.id,{replace:!!modal.group});setTab('expenses');setCategory('all');setQuery('');setModal(inviteMemberIds.length ? {type:'share',inviteMemberIds} : null);setToast(modal.group ? t("Grupo actualizado.") : t("Grupo creado.")); }} />}
    {modal?.type === 'payment' && group && <PaymentForm group={modal.baseGroup || group} transfer={modal.transfer} onClose={() => setModal(null)} onSave={async payment => { const base=modal.baseGroup||group;await updateGroup({ ...base, settlements: [payment, ...base.settlements] },base); setModal(null); setToast(t("Pago registrado.")); }} />}
    {modal?.type === 'detail' && <ExpenseDetail group={modal.baseGroup || group} expense={modal.expense} onClose={() => setModal(null)} onEdit={() => setModal({ ...modal,type: 'expense' })} onDelete={() => setModal({ ...modal,type: 'deleteExpense' })} />}
    {modal?.type === 'deleteExpense' && <ConfirmDialog title={t("¿Eliminar este gasto?")} message={t(group._shared ? 'Se eliminará “{title}” y se recalcularán los balances para todo el grupo.' : 'Se eliminará “{title}” y se recalcularán los balances.', { title: modal.expense.title })} onClose={() => setModal({ ...modal,type: 'detail' })} onConfirm={async () => { const base=modal.baseGroup || group; await updateGroup({ ...base, expenses: base.expenses.filter(exp => exp.id !== modal.expense.id) },base); setModal(null); setToast(t("Gasto eliminado.")); }} />}
    {modal?.type === 'deleteGroup' && <ConfirmDialog title={group._shared ? t("¿Salir de este grupo?") : t("¿Eliminar este grupo?")} message={accountId && group._shared ? t('“{name}” se quitará de tu cuenta en todos tus dispositivos. Los demás conservarán su acceso; puedes volver con el enlace.', { name: group.name }) : group._shared ? t('“{name}” se quitará de este dispositivo. Los demás conservarán su acceso; puedes volver con el enlace.', { name: group.name }) : t('“{name}” y sus movimientos se eliminarán de este dispositivo. Puedes descargar un respaldo antes.', { name: group.name })} label={group._shared ? t("Salir del grupo") : t("Eliminar")} onClose={() => setModal(null)} onConfirm={async () => { if(accountId && group._shared)await accountSync.leaveGroup(group);else setState(current => {const groups=current.groups.filter(g => g.id!==group.id);return {...current,groups,activeGroupId:groups[0]?.id||null};}); navigate('groups',{replace:true});setModal(null);setToast(accountId && group._shared ? t("Saliste del grupo en tu cuenta.") : group._shared ? t("Saliste del grupo en este dispositivo.") : t("Grupo eliminado.")); }} />}
    {modal?.type === 'deletePayment' && <ConfirmDialog title={t("¿Eliminar este pago?")} message={t("Los balances volverán a incluir el importe de este pago.")} onClose={() => setModal(null)} onConfirm={async () => { await updateGroup({ ...group, settlements: group.settlements.filter(p => p.id !== modal.payment.id) }); setModal(null); setToast(t("Pago eliminado.")); }} />}
    {modal?.type === 'import' && <ConfirmDialog title={t("Tu respaldo está listo.")} message={accountId ? t('Se añadirán {shared} grupos compartidos a tu cuenta y {local} locales a este navegador, sin borrar los existentes. Los compartidos cuentan dentro del límite de 6; los locales son ilimitados. Si falla una incorporación, las anteriores se conservan.', { shared: modal.data.groups.filter(item => item._shared).length, local: modal.data.groups.filter(item => !item._shared).length }) : t('Se importarán {count} grupos. Esto reemplazará los datos actuales de este dispositivo. Descarga un respaldo primero si quieres conservarlos.', { count: modal.data.groups.length })} label={accountId ? t("Añadir a mi cuenta") : t("Importar respaldo")} onClose={() => setModal(null)} onConfirm={async () => { if(accountId) {await accountSync.restoreBackup(modal.data.groups);} else {assertSharedGroupCapacity([],modal.data.groups.filter(item => item._shared).map(item => item.id));setState(modal.data);}navigate('groups',{replace:true});setTab('expenses'); setQuery(''); setCategory('all'); setModal(null); setToast(t("Respaldo importado. Todo en su lugar.")); }} />}
    {modal?.type === 'accountImport' && <AccountImportDialog groups={modal.groups} sharedCount={countSharedGroups(state.groups)} onClose={() => setModal(null)} onImport={async groups => {await accountSync.incorporate(groups);setModal(null);setToast(t("Grupos añadidos a tu cuenta."));}} />}
    {modal?.type === 'data' && <Modal title={t("Tus planes, a salvo.")} subtitle={t("Tus datos son tuyos. Guárdalos y llévalos contigo.")} onClose={() => setModal(null)}><div className="data-options"><button onClick={exportJSON}><span className="category-icon mint"><FileJson size={22} /></span><span><strong>{t("Descargar un respaldo")}</strong><small>{t("Todos tus grupos, gastos y pagos en JSON")}</small></span><Download size={19} /></button><button onClick={() => { setModal(null); importRef.current.click(); }}><span className="category-icon lavender"><Upload size={22} /></span><span><strong>{t("Importar un respaldo")}</strong><small>{t("Recupera tus datos en este dispositivo")}</small></span><ChevronRight size={19} /></button></div><p className="info-note"><ShieldCheck size={19} />{t("Los grupos compartidos se guardan en línea y se sincronizan. Los grupos locales permanecen en este navegador. Tu respaldo JSON incluye los enlaces privados: guárdalo solo donde tú puedas acceder.")}</p><div className="data-stats"><span><strong>{state.groups.length}</strong>{" "}{t("grupos")}</span><span><strong>{state.groups.reduce((sum, g) => sum + g.expenses.length, 0)}</strong>{" "}{t("gastos")}</span><span><strong>{state.groups.reduce((sum, g) => sum + g.settlements.length, 0)}</strong>{" "}{t("pagos")}</span></div></Modal>}
    {modal?.type === 'help' && <Modal title={t("Compartir, así de fácil.")} subtitle={t("Tres pasos para que las cuentas no se interpongan.")} onClose={() => setModal(null)}><div className="help-steps">{[[t("Armen el grupo"), t("Ponle nombre al plan y añade a las personas que lo comparten.")], [t("Anoten los gastos"), t("Elige quién pagó y reparte por igual o con importes exactos.")], [t("Queden a mano"), t("Splitcount calcula quién debe a quién. Registren los pagos que hagan por fuera.")]].map(([title, text]) => <div key={title}><div><h3>{t(title)}</h3><p>{t(text)}</p></div></div>)}</div><p className="info-note"><ShieldCheck size={19} />{t("Usa Compartir para activar la sincronización de un grupo e invitar por enlace. Cada persona elige su nombre para ver su saldo. Tu espacio empieza vacío: tú eliges los grupos y los gastos que añades.")}</p><button className="button primary full-width" onClick={() => setModal(null)}>{t("Vamos al plan")}<ArrowRight size={17} /></button></Modal>}
  </div>;
}
