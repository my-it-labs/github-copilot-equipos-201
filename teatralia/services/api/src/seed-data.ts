// Catálogo de datos de ejemplo de Teatralia: promotores, recintos y eventos.
// seed.ts genera a partir de aquí los pedidos, entradas, reembolsos e incidencias (siempre los mismos).

export interface TenantDef {
  id: string;
  slug: string;
  name: string;
  host: string;
  emailProvider: 'smtp' | 'sendgrid' | 'mailgun';
  emailFrom: string;
  emailConfig: Record<string, unknown>;
  color: string;
}

export const TENANTS: TenantDef[] = [
  { id: 'TN-FARO', slug: 'sala-faro', name: 'Sala Faro', host: 'entradas.salafaro.localhost', emailProvider: 'smtp', emailFrom: 'entradas@salafaro.test', emailConfig: {}, color: '#0b1d2e' },
  { id: 'TN-LUMEN', slug: 'teatro-lumen', name: 'Teatro Lumen', host: 'entradas.teatrolumen.localhost', emailProvider: 'sendgrid', emailFrom: 'taquilla@teatrolumen.test', emailConfig: { apiKey: 'SG.ejemplo-no-real.0000000000' }, color: '#5b1035' },
  { id: 'TN-OLIVO', slug: 'auditorio-olivo', name: 'Auditorio El Olivo', host: 'entradas.auditorioolivo.localhost', emailProvider: 'smtp', emailFrom: 'taquilla@auditorioolivo.test', emailConfig: {}, color: '#2f4a1e' },
  { id: 'TN-CIERZO', slug: 'teatro-cierzo', name: 'Teatro Cierzo', host: 'entradas.teatrocierzo.localhost', emailProvider: 'mailgun', emailFrom: 'hola@teatrocierzo.test', emailConfig: { domain: 'mg.teatrocierzo.test', apiKey: 'key-ejemplo-no-real-1111' }, color: '#3b3b58' },
  { id: 'TN-ALBORADA', slug: 'festival-alborada', name: 'Festival Alborada', host: 'entradas.festivalalborada.localhost', emailProvider: 'smtp', emailFrom: 'info@festivalalborada.test', emailConfig: {}, color: '#c2410c' },
  { id: 'TN-MAREA', slug: 'sala-marea', name: 'Sala Marea', host: 'entradas.salamarea.localhost', emailProvider: 'smtp', emailFrom: 'entradas@salamarea.test', emailConfig: {}, color: '#0e7490' },
];

export interface ZoneDef {
  zone: string;
  rows: string[];
  seatsPerRow: number;
  priceCents: number;
}

export interface VenueDef {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  accessibleSeats: number;
  zones: ZoneDef[]; // vacío = recinto sin butacas numeradas (solo pases)
  standingCapacity: number; // aforo de pie / pases
}

const rows = (from: string, to: string) => {
  const out: string[] = [];
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) out.push(String.fromCharCode(c));
  return out;
};

export const VENUES: VenueDef[] = [
  {
    id: 'VN-FARO', tenantId: 'TN-FARO', name: 'Sala Faro', city: 'A Coruña', accessibleSeats: 4, standingCapacity: 150,
    zones: [
      { zone: 'platea', rows: rows('A', 'J'), seatsPerRow: 20, priceCents: 3550 },
      { zone: 'anfiteatro', rows: rows('K', 'O'), seatsPerRow: 20, priceCents: 2400 },
    ],
  },
  {
    id: 'VN-LUMEN', tenantId: 'TN-LUMEN', name: 'Teatro Lumen', city: 'Madrid', accessibleSeats: 6, standingCapacity: 120,
    zones: [
      { zone: 'platea', rows: rows('A', 'L'), seatsPerRow: 16, priceCents: 2800 },
      { zone: 'palco', rows: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], seatsPerRow: 4, priceCents: 4500 },
    ],
  },
  {
    id: 'VN-OLIVO', tenantId: 'TN-OLIVO', name: 'Auditorio El Olivo', city: 'Sevilla', accessibleSeats: 12, standingCapacity: 0,
    zones: [
      { zone: 'platea', rows: rows('A', 'P'), seatsPerRow: 24, priceCents: 3200 },
      { zone: 'movilidad reducida', rows: ['MR'], seatsPerRow: 12, priceCents: 3200 },
      { zone: 'anfiteatro', rows: rows('Q', 'T'), seatsPerRow: 24, priceCents: 1825 },
    ],
  },
  {
    id: 'VN-CIERZO', tenantId: 'TN-CIERZO', name: 'Teatro Cierzo', city: 'Zaragoza', accessibleSeats: 4, standingCapacity: 0,
    zones: [
      { zone: 'platea', rows: rows('A', 'H'), seatsPerRow: 18, priceCents: 2275 },
      { zone: 'anfiteatro', rows: rows('I', 'L'), seatsPerRow: 18, priceCents: 1550 },
    ],
  },
  { id: 'VN-ALBORADA', tenantId: 'TN-ALBORADA', name: 'Recinto Marina Sur', city: 'Valencia', accessibleSeats: 0, standingCapacity: 2000, zones: [] },
  { id: 'VN-MAREA', tenantId: 'TN-MAREA', name: 'Sala Marea', city: 'Bilbao', accessibleSeats: 0, standingCapacity: 400, zones: [] },
];

export interface PassDef {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  capacity: number;
}

export type EventStatus = 'on_sale' | 'sold_out' | 'cancelled' | 'postponed';

export interface EventDef {
  id: string;
  venueId: string;
  title: string;
  category: 'música' | 'teatro' | 'danza' | 'humor' | 'familiar' | 'festival';
  startsAt: string;
  status: EventStatus;
  feeCents: number;
  seated: boolean; // usa el mapa de butacas del recinto
  passes: PassDef[];
  demand: number; // 0..1: qué parte del aforo se vende
  page?: string; // fichero de seed/ con la página propia; si no, se genera
}

const GENERAL = (price: number, capacity: number): PassDef => ({ code: 'GEN', name: 'General', description: 'Entrada de pie', priceCents: price, capacity });
const VIP = (price: number, capacity: number): PassDef => ({ code: 'VIP', name: 'VIP', description: 'Acceso preferente y encuentro con los artistas', priceCents: price, capacity });

export const EVENTS: EventDef[] = [
  // Sala Faro (A Coruña): butacas + pases de pie
  { id: 'EV-FARO-0038', venueId: 'VN-FARO', title: 'Noche de boleros', category: 'música', startsAt: '2026-10-10T21:00:00+02:00', status: 'on_sale', feeCents: 90, seated: true, passes: [], demand: 0.8 },
  { id: 'EV-FARO-0042', venueId: 'VN-FARO', title: 'Jazz en el Faro', category: 'música', startsAt: '2026-12-12T21:00:00+01:00', status: 'on_sale', feeCents: 90, seated: true, passes: [{ code: 'PIE', name: 'De pie', description: 'Zona de barra, sin butaca', priceCents: 1800, capacity: 150 }, VIP(6000, 20)], demand: 0.55, page: 'sala-faro-jazz.tsx' },
  { id: 'EV-FARO-0045', venueId: 'VN-FARO', title: 'Cuarteto Atlántico', category: 'música', startsAt: '2026-12-19T20:30:00+01:00', status: 'sold_out', feeCents: 90, seated: true, passes: [], demand: 1 },
  { id: 'EV-FARO-0047', venueId: 'VN-FARO', title: 'Tributo a Mercedes Sosa', category: 'música', startsAt: '2027-01-23T21:00:00+01:00', status: 'on_sale', feeCents: 90, seated: true, passes: [VIP(5500, 16)], demand: 0.35 },
  { id: 'EV-FARO-0049', venueId: 'VN-FARO', title: 'Fado y saudade', category: 'música', startsAt: '2027-02-13T21:00:00+01:00', status: 'postponed', feeCents: 90, seated: true, passes: [], demand: 0.25 },

  // Teatro Lumen (Madrid): platea + palcos y funciones de impro sin numerar
  { id: 'EV-LUMEN-0005', venueId: 'VN-LUMEN', title: 'La casa de Bernarda Alba', category: 'teatro', startsAt: '2026-10-24T20:00:00+02:00', status: 'on_sale', feeCents: 75, seated: true, passes: [], demand: 0.9 },
  { id: 'EV-LUMEN-0007', venueId: 'VN-LUMEN', title: 'Impro a la carta', category: 'humor', startsAt: '2026-12-05T20:30:00+01:00', status: 'on_sale', feeCents: 75, seated: false, passes: [GENERAL(1500, 120)], demand: 0.6, page: 'teatro-lumen-impro.tsx' },
  { id: 'EV-LUMEN-0009', venueId: 'VN-LUMEN', title: 'Esperando a Godot', category: 'teatro', startsAt: '2026-12-17T20:00:00+01:00', status: 'on_sale', feeCents: 75, seated: true, passes: [], demand: 0.5 },
  { id: 'EV-LUMEN-0010', venueId: 'VN-LUMEN', title: 'Cuentos para dormir despiertos', category: 'familiar', startsAt: '2026-12-27T12:00:00+01:00', status: 'on_sale', feeCents: 50, seated: true, passes: [], demand: 0.7 },
  { id: 'EV-LUMEN-0012', venueId: 'VN-LUMEN', title: 'Monólogos de enero', category: 'humor', startsAt: '2027-01-16T21:30:00+01:00', status: 'cancelled', feeCents: 75, seated: false, passes: [GENERAL(1600, 120)], demand: 0.45 },
  { id: 'EV-LUMEN-0014', venueId: 'VN-LUMEN', title: 'Bodas de sangre', category: 'teatro', startsAt: '2027-03-06T20:00:00+01:00', status: 'on_sale', feeCents: 75, seated: true, passes: [], demand: 0.2 },

  // Auditorio El Olivo (Sevilla): gran aforo con zona de movilidad reducida
  { id: 'EV-OLIVO-0101', venueId: 'VN-OLIVO', title: 'Orquesta Bética: Beethoven 9', category: 'música', startsAt: '2026-11-07T20:00:00+01:00', status: 'on_sale', feeCents: 100, seated: true, passes: [], demand: 0.75 },
  { id: 'EV-OLIVO-0103', venueId: 'VN-OLIVO', title: 'Flamenco de cámara', category: 'danza', startsAt: '2026-12-10T21:00:00+01:00', status: 'on_sale', feeCents: 100, seated: true, passes: [], demand: 0.45 },
  { id: 'EV-OLIVO-0104', venueId: 'VN-OLIVO', title: 'Concierto de Navidad', category: 'música', startsAt: '2026-12-22T19:00:00+01:00', status: 'sold_out', feeCents: 100, seated: true, passes: [], demand: 1 },
  { id: 'EV-OLIVO-0106', venueId: 'VN-OLIVO', title: 'El lago de los cisnes', category: 'danza', startsAt: '2027-01-30T19:30:00+01:00', status: 'on_sale', feeCents: 100, seated: true, passes: [], demand: 0.3 },
  { id: 'EV-OLIVO-0108', venueId: 'VN-OLIVO', title: 'Tango sinfónico', category: 'música', startsAt: '2027-02-20T20:00:00+01:00', status: 'cancelled', feeCents: 100, seated: true, passes: [], demand: 0.2 },

  // Teatro Cierzo (Zaragoza)
  { id: 'EV-CIERZO-0021', venueId: 'VN-CIERZO', title: 'Luces de bohemia', category: 'teatro', startsAt: '2026-09-26T20:00:00+02:00', status: 'on_sale', feeCents: 80, seated: true, passes: [], demand: 0.85 },
  { id: 'EV-CIERZO-0023', venueId: 'VN-CIERZO', title: 'Payasos sin fronteras', category: 'familiar', startsAt: '2026-11-29T12:00:00+01:00', status: 'on_sale', feeCents: 60, seated: true, passes: [], demand: 0.65 },
  { id: 'EV-CIERZO-0024', venueId: 'VN-CIERZO', title: 'Comedia del arte', category: 'humor', startsAt: '2026-12-13T19:00:00+01:00', status: 'postponed', feeCents: 80, seated: true, passes: [], demand: 0.4 },
  { id: 'EV-CIERZO-0026', venueId: 'VN-CIERZO', title: 'Danza contemporánea: Raíces', category: 'danza', startsAt: '2027-01-09T20:00:00+01:00', status: 'on_sale', feeCents: 80, seated: true, passes: [], demand: 0.3 },
  { id: 'EV-CIERZO-0027', venueId: 'VN-CIERZO', title: 'Historia de un idiota contada por él mismo: versión íntegra', category: 'teatro', startsAt: '2027-02-06T20:00:00+01:00', status: 'on_sale', feeCents: 80, seated: true, passes: [], demand: 0.15 },

  // Festival Alborada (Valencia): solo pases, abonos de varios días
  { id: 'EV-ALBORADA-2026', venueId: 'VN-ALBORADA', title: 'Alborada 2026: jornada única', category: 'festival', startsAt: '2026-09-12T17:00:00+02:00', status: 'on_sale', feeCents: 150, seated: false, passes: [GENERAL(3900, 1500), VIP(9500, 200)], demand: 0.8 },
  { id: 'EV-ALBORADA-INV', venueId: 'VN-ALBORADA', title: 'Alborada de invierno', category: 'festival', startsAt: '2027-01-02T18:00:00+01:00', status: 'on_sale', feeCents: 150, seated: false, passes: [GENERAL(2900, 1200), VIP(7500, 150), { code: 'NIN', name: 'Infantil', description: 'Menores de 12 años acompañados', priceCents: 0, capacity: 200 }], demand: 0.35 },
  { id: 'EV-ALBORADA-2027', venueId: 'VN-ALBORADA', title: 'Alborada 2027: abono tres días', category: 'festival', startsAt: '2027-06-18T17:00:00+02:00', status: 'on_sale', feeCents: 150, seated: false, passes: [{ code: 'ABO', name: 'Abono 3 días', description: 'Acceso viernes, sábado y domingo', priceCents: 11900, capacity: 1800 }, VIP(24900, 150)], demand: 0.12 },

  // Sala Marea (Bilbao): conciertos de pie
  { id: 'EV-MAREA-0301', venueId: 'VN-MAREA', title: 'Los Bravos del Nervión', category: 'música', startsAt: '2026-10-31T21:30:00+01:00', status: 'on_sale', feeCents: 120, seated: false, passes: [GENERAL(2200, 400)], demand: 0.9 },
  { id: 'EV-MAREA-0303', venueId: 'VN-MAREA', title: 'Cumbia en el puerto', category: 'música', startsAt: '2026-12-04T22:00:00+01:00', status: 'sold_out', feeCents: 120, seated: false, passes: [GENERAL(1800, 400)], demand: 1 },
  { id: 'EV-MAREA-0304', venueId: 'VN-MAREA', title: 'Electrónica de mar', category: 'música', startsAt: '2026-12-31T23:30:00+01:00', status: 'on_sale', feeCents: 120, seated: false, passes: [GENERAL(3500, 350), VIP(6500, 50)], demand: 0.6 },
  { id: 'EV-MAREA-0306', venueId: 'VN-MAREA', title: 'Rock de garaje', category: 'música', startsAt: '2027-01-22T21:30:00+01:00', status: 'on_sale', feeCents: 120, seated: false, passes: [GENERAL(1500, 400)], demand: 0.25 },
  { id: 'EV-MAREA-0307', venueId: 'VN-MAREA', title: 'Stand-up bilingüe', category: 'humor', startsAt: '2027-02-27T21:00:00+01:00', status: 'cancelled', feeCents: 120, seated: false, passes: [GENERAL(1700, 300)], demand: 0.3 },
];

// Compradores: nombres de España y Latinoamérica, siempre en dominios .test
export const FIRST_NAMES = ['ana', 'lucia', 'martina', 'valentina', 'camila', 'sofia', 'julieta', 'paula', 'carmen', 'elena', 'ximena', 'renata', 'daniela', 'pablo', 'mateo', 'santiago', 'diego', 'javier', 'tomas', 'nicolas', 'andres', 'joaquin', 'emilio', 'facundo', 'bruno', 'ignacio', 'agustin', 'rodrigo'];
export const LAST_NAMES = ['garcia', 'fernandez', 'lopez', 'martinez', 'gomez', 'perez', 'sanchez', 'romero', 'diaz', 'alvarez', 'torres', 'ruiz', 'herrera', 'medina', 'castro', 'vargas', 'rojas', 'molina', 'ortiz', 'silva', 'acosta', 'paz', 'navarro', 'quiroga'];
export const EMAIL_DOMAINS = ['ejemplo.test', 'correo.test', 'mail.test', 'buzon.test'];

export const CASE_TEMPLATES: { category: string; subject: string; body: string }[] = [
  { category: 'devolución', subject: 'Quiero devolver mis entradas', body: 'No puedo asistir por un viaje de trabajo. ¿Me podéis devolver el importe?' },
  { category: 'devolución', subject: 'Devolución por aplazamiento', body: 'El evento se ha aplazado y la nueva fecha no me viene bien. Pido la devolución completa, gastos incluidos.' },
  { category: 'devolución', subject: 'Me devolvisteis menos de lo que pagué', body: 'Pedí la devolución y me habéis devuelto unos céntimos menos de lo que dice la política. ¿Es correcto?' },
  { category: 'cambio de titular', subject: 'Cambiar el nombre de la entrada', body: 'Regalé la entrada a mi hermana. ¿Se puede poner a su nombre?' },
  { category: 'acceso', subject: 'El QR no funciona en la puerta', body: 'En la entrada me dijeron que el código no era válido. Al final me dejaron pasar, pero quiero saber qué pasó.' },
  { category: 'cobro', subject: 'Me habéis cobrado dos veces', body: 'En el extracto del banco aparecen dos cargos del mismo importe para el mismo pedido.' },
  { category: 'accesibilidad', subject: 'Plaza para silla de ruedas', body: 'Voy en silla de ruedas y no veo cómo reservar una plaza adaptada con acompañante.' },
  { category: 'correo', subject: 'He recibido tres correos de confirmación', body: 'Me han llegado tres correos iguales con las entradas. ¿Tengo tres pedidos?' },
  { category: 'correo', subject: 'No me ha llegado el correo', body: 'Pagué hace una hora y no tengo el correo con las entradas. Ya miré en spam.' },
  { category: 'devolución', subject: 'Evento cancelado: ¿cuándo me devolvéis?', body: 'He visto que el evento se ha cancelado. ¿Tengo que hacer algo para recibir el dinero?' },
];
