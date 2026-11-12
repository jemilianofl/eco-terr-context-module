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
  const direction = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${degrees}°${minutes}'${seconds}"${direction}`;
};

// Paleta de colores ajustada para asemejarse más a las cartas oficiales
export const getColorForVegetation = (str: string) => {
  const typeVeg = str.toUpperCase();
  
  if (typeVeg.includes('AGRICULTURA')) return '#fde047'; // Amarillo claro
  if (typeVeg.includes('BOSQUE')) return '#22c55e'; // Verde bosque
  if (typeVeg.includes('SELVA')) return '#a855f7'; // Morado
  if (typeVeg.includes('MANGLAR')) return '#4c1d95'; // Morado muy oscuro
  if (typeVeg.includes('PASTIZAL')) return '#bbf7d0'; // Verde muy claro
  if (typeVeg.includes('MATORRAL')) return '#f59e0b'; // Naranja/Marrón claro
  if (typeVeg.includes('URBANA') || typeVeg.includes('ASENTAMIENTOS')) return '#9ca3af'; // Gris
  if (typeVeg.includes('AGUA') || typeVeg.includes('ACUÍCOLA')) return '#3b82f6'; // Azul
  if (typeVeg.includes('DESPROVISTO')) return '#fbcfe8'; // Rosa muy pálido (casi blanco)
  if (typeVeg.includes('VEGETACIÓN SECUNDARIA')) return '#f472b6'; // Rosa

  const colors = [
    '#a3e635', '#4ade80', '#fbbf24', '#f87171', '#60a5fa', '#c084fc', 
    '#f472b6', '#fb923c', '#38bdf8', '#34d399', '#a78bfa', '#fbb6ce', 
    '#86efac', '#fde047', '#14b8a6', '#f43f5e', '#8b5cf6', '#d946ef'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.codePointAt(i) || 0 + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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