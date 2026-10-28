import { useState } from 'react';
import { ArrowRight, Check, Cloud, Download, FileJson, HelpCircle, Moon, Plus, ReceiptText, RefreshCw, Sun, Upload, Users } from 'lucide-react';
import { calculateBalances, formatMoney } from './domain.js';
import GoogleAccount from './GoogleAccount.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import { actualizarApp, avisoPara, instaladaAhora, plataformaActual } from './pwa.js';
import { VERSION } from './version.js';

const AVISO_ACTUALIZACION = {
  aldia: `Ya tienes la versión ${VERSION}.`,
  instalando: 'Descargando la versión nueva. Se aplicará al terminar.',
  error: 'No se pudo buscar la actualización.',
  'sin-soporte': 'Este navegador no puede actualizar la app.',
};

const initials = name => name.split(' ').filter(word => word.length > 2).slice(0, 2).map(word => word[0]).join('').toUpperCase() || name.slice(0, 1).toUpperCase();
const nameOf = (group, id) => group.members.find(member => member.id === id)?.name || 'Integrante';
const dateOf = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

export function HomeScreen({ groups, onOpen, onCreate }) {
  return <section className="mobile-home"><div className="home-heading"><div><h1>Tus grupos</h1><p className="home-intro">{groups.length ? `${groups.length} ${groups.length === 1 ? 'plan en común' : 'planes en común'}` : 'Empieza con tu próximo plan.'}</p></div><button className="button secondary" onClick={onCreate}><Plus size={18} /><span>Nuevo grupo</span></button></div>
    {groups.length ? <div className="group-cards">{groups.map(group => {
      const self = group._shared ? group._selfId : group.members.find(member => member.id === 'you')?.id || group.members[0].id;
      const balance = self ? calculateBalances(group)[self] : null;
      return <button className="group-card" key={group.id} onClick={() => onOpen(group.id)}><span className="group-card-mark">{initials(group.name)}</span><span className="group-card-main"><strong>{group.name}</strong><small>{group.members.length} personas · {group.currency}{group.isDemo ? ' · Ejemplo' : ''}</small><span className="group-card-sync">{group._shared ? <><Cloud size={13} />Compartido</> : 'Solo en este dispositivo'}</span></span><span className="group-card-balance"><small>{balance === null ? 'Tu identidad' : balance > 0 ? 'Te deben' : balance < 0 ? 'Debes' : 'Al día'}</small><strong className={balance > 0 ? 'positive' : ''}>{balance === null ? 'Elegir nombre' : formatMoney(Math.abs(balance), group.currency)}</strong></span><ArrowRight className="group-card-arrow" size={17} /></button>;
    })}</div> : <div className="home-empty"><Users size={32} /><h2>Un grupo para cada plan</h2><p>Añade a quienes participan y registra el primer gasto.</p><button className="button primary" onClick={onCreate}><Plus size={18} />Crear grupo</button></div>}
  </section>;
}

export function ActivityScreen({ groups, onOpen }) {
  const items = groups.flatMap(group => [
    ...group.expenses.map(item => ({ ...item, kind: 'expense', group })),
    ...group.settlements.map(item => ({ ...item, kind: 'payment', group })),
  ]).sort((a, b) => b.date.localeCompare(a.date));
  return <section className="mobile-activity"><div className="home-heading"><div><h1>Actividad</h1><p className="home-intro">Movimientos de todos tus grupos.</p></div></div><div className="main-panel activity-feed">{items.length ? items.map(item => <button className="activity-row" key={`${item.group.id}-${item.kind}-${item.id}`} onClick={() => onOpen(item.group, item)}><span className="activity-dot">{item.kind === 'payment' ? <Check size={17} /> : <ReceiptText size={17} />}</span><div><p><strong>{item.kind === 'payment' ? `${nameOf(item.group, item.from)} pagó a ${nameOf(item.group, item.to)}` : item.title}</strong></p><small className="activity-group-name">{item.group.name} · {dateOf(item.date)}</small></div><strong>{formatMoney(item.amount, item.group.currency)}</strong><ArrowRight size={15} /></button>) : <div className="empty-state"><h2>Todo empieza con un gasto</h2><p>Cuando añadas gastos o pagos aparecerán aquí.</p></div>}</div></section>;
}

export function SettingsScreen({ theme, onTheme, onExport, onImport, onHelp, auth, accountSync, count, sharedCount, onAddLocal }) {
  const instalada = instaladaAhora();
  const [buscando, setBuscando] = useState(false);
  const [avisoActualizacion, setAvisoActualizacion] = useState('');
  async function buscarActualizacion() {
    if (buscando) return;
    setBuscando(true);
    setAvisoActualizacion('');
    try {
      const resultado = await actualizarApp();
      if (resultado !== 'actualizando') setAvisoActualizacion(AVISO_ACTUALIZACION[resultado] || AVISO_ACTUALIZACION.error);
    } catch {
      setAvisoActualizacion(AVISO_ACTUALIZACION.error);
    } finally {
      setBuscando(false);
    }
  }
  const instalacion = instalada ? 'Splitcount está instalada en este dispositivo.' : avisoPara(plataformaActual()).texto;
  return <section className="settings-page"><div className="home-heading"><div><h1>Ajustes</h1><p className="home-intro">Tu apariencia y tus datos.</p></div></div>
    <GoogleAccount auth={auth} theme={theme} accountSync={accountSync} count={count} sharedCount={sharedCount} onAddLocal={onAddLocal} />
    {auth.session && auth.access?.isAdmin && <AdminDashboard auth={auth} />}
    <section className="settings-section"><h2>Apariencia</h2><p>Se guarda en este dispositivo.</p><div className="theme-choice" role="group" aria-label="Tema de la aplicación"><button aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}><Moon size={20} />Oscuro{theme === 'dark' && <Check size={16} />}</button><button aria-pressed={theme === 'light'} onClick={() => onTheme('light')}><Sun size={20} />Claro{theme === 'light' && <Check size={16} />}</button></div></section>
    <section className="settings-section"><h2>Tus datos</h2><button className="settings-action" onClick={onExport}><FileJson size={20} /><span><strong>Descargar respaldo</strong><small>Grupos, gastos y pagos en JSON</small></span><Download size={18} /></button><button className="settings-action" onClick={onImport}><Upload size={20} /><span><strong>Importar respaldo</strong><small>Recuperar datos en este dispositivo</small></span><ArrowRight size={18} /></button><p className="settings-note">Los grupos compartidos se sincronizan en línea. Los locales se guardan aquí. El respaldo incluye los enlaces privados: consérvalo en un lugar seguro.</p></section>
    <section className="settings-section"><h2>Acerca de Splitcount</h2>{instalada && <button className="settings-action" onClick={buscarActualizacion} disabled={buscando}><RefreshCw size={20} /><span><strong>{buscando ? 'Buscando…' : 'Buscar actualización'}</strong><small>Versión {VERSION}</small></span></button>}<button className="settings-action" onClick={onHelp}><HelpCircle size={20} /><span><strong>Cómo funciona</strong><small>Grupos, gastos y cuentas saldadas</small></span><ArrowRight size={18} /></button><p className="settings-note">Splitcount registra los gastos y pagos del grupo. Las transferencias de dinero se hacen por el medio que prefieran.</p><p className="settings-note">{instalacion}</p>{avisoActualizacion && <p className="settings-note" role="status">{avisoActualizacion}</p>}<p className="settings-version">Versión {VERSION}</p></section>
  </section>;
}

export function TransferList({ group, transfers, onPayment, className = '' }) {
  return <section className={`settle-card ${className}`}><div className="card-title"><h3>Para quedar a mano</h3></div><p className="card-subtitle">Las transferencias necesarias para saldar el grupo.</p>{transfers.length ? <div className="transfers">{transfers.map((transfer, index) => <div className="transfer" key={`${transfer.from}-${transfer.to}-${index}`}><div className="transfer-people"><span className="avatar small">{nameOf(group, transfer.from).slice(0, 1)}</span><span><strong>{nameOf(group, transfer.from)}</strong><ArrowRight size={13} /><strong>{nameOf(group, transfer.to)}</strong></span></div><div className="transfer-bottom"><strong>{formatMoney(transfer.amount, group.currency)}</strong><button onClick={() => onPayment(transfer)}>Registrar pago<ArrowRight size={14} /></button></div></div>)}</div> : <div className="all-settled"><Check size={30} /><strong>Están a mano</strong><p>No hay cuentas pendientes.</p></div>}<button className="button secondary full-width settle-button" onClick={() => onPayment()}><Check size={17} />Registrar un pago</button></section>;
}
