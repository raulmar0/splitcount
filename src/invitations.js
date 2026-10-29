export function newInvitees(members, existingMembers = [], selfId = 'you') {
  const existing = new Set(existingMembers.map(member => member.id));
  return members.filter(member => member.id !== selfId && !existing.has(member.id)).map(member => member.id);
}

export function invitationHref(channel, contact, { groupName, memberName, link, message: translatedMessage, subject: translatedSubject }) {
  const value = contact.trim();
  const message = translatedMessage ?? `Hola${memberName ? `, ${memberName}` : ''}. Te invito a “${groupName}” en Splitcount para compartir gastos y llevar las cuentas juntos. Entra y elige tu nombre: ${link}`;
  if (channel === 'email') {
    if (!/^[A-Za-z0-9.!#$%&'*+/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value)) return null;
    return `mailto:${encodeURIComponent(value)}?subject=${encodeURIComponent(translatedSubject ?? `Te invito a ${groupName} en Splitcount`)}&body=${encodeURIComponent(message)}`;
  }
  if (channel !== 'sms' && channel !== 'whatsapp') return null;
  if (!/^\+[\d ()-]+$/.test(value)) return null;
  const phone = value.replace(/[ ()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return channel === 'whatsapp'
    ? `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}`
    : `sms:${phone}?body=${encodeURIComponent(message)}`;
}
