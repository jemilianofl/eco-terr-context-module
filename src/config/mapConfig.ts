export const ECO_LAYERS_CONFIG = [
  { id: 'aicas', file: 'aicas.fgb', title: 'Área de Importancia para la Conservación de las Aves (AICA)', color: '#d63384' },
  { id: 'ramsar', file: 'ramsar.fgb', title: 'Sitio Ramsar', color: '#0d6efd' },
  { id: 'anp_federal', file: 'anp_federal.fgb', title: 'Área Natural Protegida federal', color: '#198754' },
  { id: 'anp_estatal', file: 'anp_estatal.fgb', title: 'Área Natural Protegida estatal o municipal', color: '#fd7e14' },
  { id: 'advc', file: 'advc.fgb', title: 'Área Destinada Voluntariamente a la Conservación (ADVC)', color: '#65a30d' },
  { id: 'rtp', file: 'rtp.fgb', title: 'Región Terrestre Prioritaria', color: '#ffc107' },
  { id: 'rhp', file: 'rhp.fgb', title: 'Región Hídrica Prioritaria', color: '#0dcaf0' },
];

// Añadidos los años correspondientes a cada serie según INEGI
export const vegSeriesOptions = [
  { id: 'serie_1', label: 'Serie I (1997)' },
  { id: 'serie_2', label: 'Serie II (2001)' },
  { id: 'serie_3', label: 'Serie III (2005)' },
  { id: 'serie_4', label: 'Serie IV (2009)' },
  { id: 'serie_5', label: 'Serie V (2013)' },
  { id: 'serie_6', label: 'Serie VI (2016)' },
  { id: 'serie_7', label: 'Serie VII (2021)' },
];

export const toDMS = (deg: number, isLat: boolean) => {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);

  let direction: string;
  if (isLat) {
    direction = deg >= 0 ? 'N' : 'S';
  } else {
    direction = deg >= 0 ? 'E' : 'W';
  }

  return `${degrees}°${minutes}'${seconds}"${direction}`;
};

const getHashColor = (str: string): string => {
  const colors = [
    '#a3e635', '#4ade80', '#fbbf24', '#f87171', '#60a5fa', '#c084fc',
    '#f472b6', '#fb923c', '#38bdf8', '#34d399', '#a78bfa', '#fbb6ce',
    '#86efac', '#fde047', '#14b8a6', '#f43f5e', '#8b5cf6', '#d946ef',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (str.codePointAt(i) ?? 0) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Paleta de colores ajustada para asemejarse más a las cartas oficiales
export const getColorForVegetation = (str: string) => {
  const typeVeg = str.toUpperCase();

  if (typeVeg.includes('AGRICULTURA')) return '#fde047';
  if (typeVeg.includes('BOSQUE')) return '#22c55e';
  if (typeVeg.includes('SELVA')) return '#a855f7';
  if (typeVeg.includes('MANGLAR')) return '#4c1d95';
  if (typeVeg.includes('PASTIZAL')) return '#bbf7d0';
  if (typeVeg.includes('MATORRAL')) return '#f59e0b';
  if (typeVeg.includes('URBANA') || typeVeg.includes('ASENTAMIENTOS')) return '#9ca3af';
  if (typeVeg.includes('AGUA') || typeVeg.includes('ACUÍCOLA')) return '#3b82f6';
  if (typeVeg.includes('DESPROVISTO')) return '#fbcfe8';
  if (typeVeg.includes('VEGETACIÓN SECUNDARIA')) return '#f472b6';

  return getHashColor(str);
};

// Paleta cartográfica para Unidades Climáticas (García - CONABIO)
export const getColorForClimate = (clave: string, tipoC: string): string => {
  const tipo = tipoC.toUpperCase();
  const c = clave.toUpperCase();

  if (tipo.includes('MUY SECO') || c.startsWith('BW')) return '#dc2626';
  if (tipo.includes('SEMISECO') || tipo.includes('SECO') || c.startsWith('BS')) return '#f97316';
  if (tipo.includes('CÁLIDO HÚMEDO') || c.startsWith('AF') || c.startsWith('AM')) return '#15803d';
  if (tipo.includes('CÁLIDO SUBHÚMEDO') || c.startsWith('AW')) return '#84cc16';
  if (tipo.includes('SEMICÁLIDO') || c.startsWith('(A)C')) return '#eab308';
  if (tipo.includes('TEMPLADO HÚMEDO') || c.startsWith('CF') || c.startsWith('CM')) return '#0d9488';
  if (tipo.includes('TEMPLADO SUBHÚMEDO') || c.startsWith('CW')) return '#22c55e';
  if (tipo.includes('SEMIFRÍO') || c.includes('C(E)')) return '#3b82f6';
  if (tipo.includes('FRÍO') || c.startsWith('E')) return '#6366f1';

  return getHashColor(`${clave}-${tipoC}`);
};

// Paleta cartográfica para Edafología INEGI Serie II (WRB)
export const getColorForEdafologia = (grupo: string): string => {
  const g = grupo.toUpperCase();

  if (g.includes('REGOSOL')) return '#eab308';
  if (g.includes('LEPTOSOL')) return '#a8a29e';
  if (g.includes('VERTISOL')) return '#57534e';
  if (g.includes('PHAEOZEM') || g.includes('FEOZEM')) return '#78350f';
  if (g.includes('CAMBISOL')) return '#d97706';
  if (g.includes('LUVISOL')) return '#dc2626';
  if (g.includes('CALCISOL')) return '#fde047';
  if (g.includes('ANDOSOL')) return '#7c3aed';
  if (g.includes('SOLONCHAK')) return '#f472b6';
  if (g.includes('GLEYSOL')) return '#0284c7';
  if (g.includes('ARENOSOL')) return '#fed7aa';
  if (g.includes('FLUVISOL')) return '#38bdf8';
  if (g.includes('KASTANOZEM')) return '#92400e';
  if (g.includes('ACRISOL')) return '#ea580c';
  if (g.includes('PLANOSOL')) return '#94a3b8';
  if (g.includes('NITISOL')) return '#b91c1c';
  if (g.includes('HISTOSOL')) return '#3f6212';
  if (g.includes('AGUA')) return '#3b82f6';
  if (g.includes('URBANA')) return '#9ca3af';

  return getHashColor(grupo);
};

// Función para abreviar/compactar nombres largos de vegetación
export const compactarNombreVeg = (nombre: string) => {
  if (!nombre) return '';
  return nombre
    .replace(/VEGETACIÓN SECUNDARIA ARBUSTIVA/gi, 'V.S. ARBUSTIVA')
    .replace(/VEGETACIÓN SECUNDARIA ARBÓREA/gi, 'V.S. ARBÓREA')
    .replace(/VEGETACIÓN SECUNDARIA/gi, 'V.S.')
    .replace(/MEDIANA CADUCIFOLIA/gi, 'M. CADUCIFOLIA')
    .replace(/MEDIANA SUBCADUCIFOLIA/gi, 'M. SUBCADUCIFOLIA')
    .replace(/BAJA CADUCIFOLIA/gi, 'B. CADUCIFOLIA')
    .replace(/AGRICULTURA DE TEMPORAL/gi, 'AGR. TEMPORAL');
};