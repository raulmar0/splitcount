import { useI18n } from './i18n.jsx';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { almacenamiento, avisoCerrado, avisoPara, cerrarAviso, instaladaAhora, plataformaActual } from './pwa.js';

export default function InstallBanner() {
  const { t } = useI18n();
  const [plataforma] = useState(plataformaActual);
  const [instalada, setInstalada] = useState(instaladaAhora);
  const [cerrado, setCerrado] = useState(() => avisoCerrado(almacenamiento()));
  const [peticion, setPeticion] = useState(null);
  const [instalando, setInstalando] = useState(false);
  const aviso = avisoPara(plataforma);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const ofrecer = event => {
      event.preventDefault();
      setInstalada(false);
      setPeticion(event);
    };
    const yaInstalada = () => { setInstalada(true); setPeticion(null); };
    window.addEventListener('beforeinstallprompt', ofrecer);
    window.addEventListener('appinstalled', yaInstalada);
    return () => {
      window.removeEventListener('beforeinstallprompt', ofrecer);
      window.removeEventListener('appinstalled', yaInstalada);
    };
  }, []);

  if (instalada || cerrado) return null;

  async function instalar() {
    if (!peticion || instalando) return;
    const evento = peticion;
    setPeticion(null);
    setInstalando(true);
    try {
      await evento.prompt();
      const { outcome } = await evento.userChoice;
      if (outcome === 'accepted') setInstalada(true);
    } catch {
      // La petición del navegador es de un solo uso.
    } finally {
      setInstalando(false);
    }
  }

  function descartar() {
    setCerrado(true);
    cerrarAviso(almacenamiento());
  }

  return <section className="pwa-banner" aria-label={t(aviso.titulo)}>
    <img className="brand-image" src={`${import.meta.env.BASE_URL}brand/splitcount-symbol.png`} alt="" width="40" height="40" />
    <div className="pwa-banner-copy"><strong>{t(aviso.titulo)}</strong><span>{t(aviso.texto)}</span></div>
    {peticion && <button type="button" className="button primary" onClick={instalar} disabled={instalando}>{t("Instalar")}</button>}
    <button type="button" className="icon-button" aria-label={t("Ahora no")} onClick={descartar}><X size={16} /></button>
  </section>;
}
