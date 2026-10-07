/** Banco novo e limpo (primeira execução). Nenhum dado de exemplo. */
function freshDb() {
  const now = new Date().toISOString();
  return {
    v: 1, schema: 3,
    settings: {
      name: 'Spinning Fany', about: 'Aulas de spinning boutique com a energia da Fany. Cada pedalada conta.',
      address: 'Antônio Polizel, 214 – Artiville', whatsapp: '5518996676637', instagram: '',
      maxBikes: 8, duration: 45, cancelHours: 2, instructor: 'Fany', gifts: true,
      terms: DEFAULT_TERMS, reminder: DEFAULT_REMINDER, infinitepayHandle: ''
    },
    packages: [
      { id: 'p1', name: '1 Aula', credits: 1, price: 4500, desc: 'Aula avulsa', kind: 'credits', validity: null, active: true, sort: 1, highlight: false },
      { id: 'p5', name: 'Pacote 5 Aulas', credits: 5, price: 19900, desc: 'Ideal para começar', kind: 'credits', validity: null, active: true, sort: 2, highlight: false },
      { id: 'p10', name: 'Pacote 10 Aulas', credits: 10, price: 34900, desc: 'Mais escolhido', kind: 'credits', validity: null, active: true, sort: 3, highlight: true },
      { id: 'p20', name: 'Pacote 20 Aulas', credits: 20, price: 59900, desc: 'Melhor custo-benefício', kind: 'credits', validity: null, active: true, sort: 4, highlight: false },
      { id: 'pm', name: 'Mensalidade', credits: 20, price: 34900, desc: '20 créditos por mês · renovação todo mês', kind: 'subscription', validity: 35, active: true, sort: 5, highlight: true }
    ],
    specials: [defaultSpecial()],
    classes: [], users: [], reservations: [], waitlist: [], purchases: [], ledger: [], notes: [], subs: [], audit: [], sessions: [],
    announcements: [{ id: 'w1', title: 'Bem-vinda ao Spinning Fany', body: 'Crie sua conta, escolha seu pacote e reserve sua bike.', at: now }]
  };
}
