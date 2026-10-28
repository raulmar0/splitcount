const everyone = ['you', 'ana', 'diego', 'sofia'];
const expense = (id, title, amount, paidBy, category, date, participants = everyone) => ({
  id, title, amount, paidBy, category, date, participants, splitMode: 'equal', note: '',
  shares: Object.fromEntries(participants.map((p, i) => [p, Math.floor(amount / participants.length) + (i < amount % participants.length ? 1 : 0)])),
});

export function createInitialState() {
  return {
    version: 1,
    activeGroupId: 'oaxaca',
    groups: [
      {
        id: 'oaxaca', name: 'Escapada a Oaxaca', emoji: '🌵', currency: 'MXN',
        description: 'Un viaje para recordar. Del 24 al 27 de octubre.',
        isDemo: true,
        members: [{ id: 'you', name: 'Tú' }, { id: 'ana', name: 'Ana' }, { id: 'diego', name: 'Diego' }, { id: 'sofia', name: 'Sofía' }],
        expenses: [
          expense('cafe', 'Un cafecito antes de volver', 44000, 'you', 'food', '2026-10-27', ['you', 'ana']),
          expense('mezcal', 'Ruta del mezcal', 120000, 'diego', 'fun', '2026-10-26'),
          expense('mercado', 'Mercado de artesanías', 96000, 'sofia', 'shopping', '2026-10-26'),
          expense('cena', 'Cena en Los Danzantes', 186000, 'ana', 'food', '2026-10-25'),
          expense('taxi', 'Del aeropuerto a la casa', 42000, 'diego', 'transport', '2026-10-24'),
          expense('casa', 'Nuestra casita en Oaxaca', 480000, 'you', 'stay', '2026-10-24'),
        ], settlements: [],
      },
      {
        id: 'casa', name: 'Depa bonito', emoji: '🏡', currency: 'MXN', description: 'Las cuentas de nuestro hogar.',
        isDemo: true, members: [{ id: 'you', name: 'Tú' }, { id: 'mar', name: 'Mar' }],
        expenses: [expense('internet', 'Internet de octubre', 65000, 'mar', 'other', '2026-10-25', ['you', 'mar']), expense('super', 'Súper de la semana', 92000, 'you', 'shopping', '2026-10-26', ['you', 'mar'])], settlements: [],
      },
      {
        id: 'viernes', name: 'Los de siempre', emoji: '🍕', currency: 'MXN', description: 'Por muchos viernes más.', isDemo: true,
        members: [{ id: 'you', name: 'Tú' }, { id: 'luis', name: 'Luis' }, { id: 'pau', name: 'Pau' }],
        expenses: [expense('pizza', 'Pizza y buena compañía', 78000, 'luis', 'food', '2026-10-23', ['you', 'luis', 'pau'])], settlements: [],
      },
    ],
  };
}
