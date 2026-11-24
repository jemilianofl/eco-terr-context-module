import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';

/** Grupos en que se ordenan las capas de contexto (panel y leyenda). */
export const CONTEXT_LAYER_GROUPS = [
  'Áreas protegidas y regiones prioritarias',
  'Ordenamiento ecológico (SIORE)',
  'Conectividad ecológica',
  'Integridad ecosistémica',
] as const;
export type ContextLayerGroup = (typeof CONTEXT_LAYER_GROUPS)[number];

/** Nombre corto para la leyenda y detalle (HTML) para el popup de un elemento. */
export interface EcoFeatureDescription {
  name: string | null;
  subtitle?: string;
}

export interface EcoLayerConfigItem {
  id: string;
  file: string;
  title: string;
  color: string;
  dashArray?: string;
  group: ContextLayerGroup;
  /** Encendida al abrir el visor. */
  defaultVisible: boolean;
  /** Relleno propio (p. ej. 0 para capas que solo se dibujan como contorno). */
  fillOpacity?: number;
  /**
   * true = se lee siempre directo de R2 (el backend todavía no la conoce).
   * Al agregarla al backend, quitar esta bandera.
   */
  r2Only?: boolean;
  /** Arma nombre y detalle a partir de los atributos propios de la capa. */
  describe?: (props: Record<string, unknown>) => EcoFeatureDescription;
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Texto limpio de un atributo; descarta vacíos y marcadores tipo "N", "N/A", "0". */
const attr = (props: Record<string, unknown>, key: string): string => {
  const v = props[key];
  // Solo valores simples; objetos o arreglos no tienen una forma legible de mostrarse
  if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  return ['', 'N', 'N/A', 'NA', 'NULL', '0', '-'].includes(s.toUpperCase()) ? '' : s;
};

const htmlRows = (rows: [string, string][]): string =>
  rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<strong>${k}:</strong> ${escapeHtml(v.length > 220 ? `${v.slice(0, 220)}…` : v)}`)
    .join('<br/>');

export const ECO_LAYERS_CONFIG: EcoLayerConfigItem[] = [
  {
    id: 'aicas',
    file: 'aicas.fgb',
    title: 'Área de Importancia para la Conservación de las Aves (AICA)',
    color: '#e11d48',
    dashArray: '6, 3',
    group: 'Áreas protegidas y regiones prioritarias',
    defaultVisible: true,
  },
  {
    id: 'ramsar',
    file: 'ramsar.fgb',
    title: 'Sitio Ramsar',
    color: '#0284c7',
    dashArray: '10, 4, 2, 4',
    group: 'Áreas protegidas y regiones prioritarias',
    defaultVisible: true,
  },
  {
    id: 'anp_federal',
    file: 'anp_federal.fgb',
    title: 'Área Natural Protegida federal',
    color: '#00b050',
    group: 'Áreas protegidas y regiones prioritarias',
    defaultVisible: true,
  },
  {
    id: 'anp_estatal',
    file: 'anp_estatal.fgb',
    title: 'Área Natural Protegida estatal o municipal',
    color: '#9333ea',
    group: 'Áreas protegidas y regiones prioritarias',
    defaultVisible: true,
  },
  {
    id: 'advc',
    file: 'advc.fgb',
    title: 'Área Destinada Voluntariamente a la Conservación (ADVC)',
    color: '#0d9488',
    dashArray: '4, 3',
    group: 'Áreas protegidas y regiones prioritarias',
    defaultVisible: true,
  },
  {
    id: 'rtp',
    file: 'rtp.fgb',
    title: 'Región Terrestre Prioritaria',
    color: '#f97316',
    dashArray: '8, 4',
    group: 'Áreas protegidas y regiones prioritarias',
    defaultVisible: true,
  },
  {
    id: 'rhp',
    file: 'rhp.fgb',
    title: 'Región Hídrica Prioritaria',
    color: '#06b6d4',
    dashArray: '8, 4',
    group: 'Áreas protegidas y regiones prioritarias',
    defaultVisible: true,
  },
  {
    id: 'uga',
    file: 'uga.fgb',
    title: 'Unidad de Gestión Ambiental (UGA) de ordenamiento ecológico',
    color: '#b45309',
    group: 'Ordenamiento ecológico (SIORE)',
    defaultVisible: true,
    fillOpacity: 0.22,
    r2Only: true,
    describe: (p) => {
      const clave = attr(p, 'clave_uga');
      const politica = attr(p, 'politica');
      const poe = attr(p, 'nombre_poe');
      const uga = clave ? `UGA ${clave}` : attr(p, 'nombre_uga') || 'UGA';
      return {
        name: `${poe ? `${poe}: ` : ''}${uga}${politica ? ` (${politica})` : ''}`,
        subtitle: htmlRows([
          ['Programa', poe],
          ['Modalidad', attr(p, 'modalidad')],
          ['Estado', attr(p, 'estado')],
          ['Clave UGA', clave],
          ['Nombre UGA', attr(p, 'nombre_uga')],
          ['Política', politica],
          ['Uso predominante', attr(p, 'uso_predominante')],
          ['Lineamiento', attr(p, 'lineamiento')],
          ['Criterios', attr(p, 'criterios')],
        ]),
      };
    },
  },
  {
    id: 'poe_limites',
    file: 'poe_limites.fgb',
    title: 'Límite de Programa de Ordenamiento Ecológico (POE)',
    color: '#7c2d12',
    dashArray: '12, 4',
    group: 'Ordenamiento ecológico (SIORE)',
    defaultVisible: false,
    fillOpacity: 0,
    r2Only: true,
    describe: (p) => {
      const poe = attr(p, 'nombre_poe');
      const modalidad = attr(p, 'modalidad');
      return {
        name: poe ? `${poe}${modalidad ? ` (${modalidad})` : ''}` : null,
        subtitle: htmlRows([
          ['Modalidad', modalidad],
          ['Estado', attr(p, 'estado')],
          ['UGA que lo integran', attr(p, 'n_poligonos')],
        ]),
      };
    },
  },
  {
    id: 'corredores_biologicos',
    file: 'corredores_biologicos.fgb',
    title: 'Corredor Biológico Mesoamericano-México (CONABIO 2015)',
    color: '#4d7c0f',
    dashArray: '14, 6',
    group: 'Conectividad ecológica',
    defaultVisible: true,
    fillOpacity: 0.18,
    r2Only: true,
    describe: (p) => {
      const corredor = attr(p, 'NOM_CB');
      const region = attr(p, 'NOM_RG');
      const subregion = attr(p, 'NOM_SRG');
      return {
        name: corredor ? `${corredor}${subregion ? ` – ${subregion}` : ''}` : null,
        subtitle: htmlRows([
          ['Corredor', corredor],
          ['Región', region],
          ['Subregión', subregion],
          ['Área de trabajo', attr(p, 'NOM_APT')],
        ]),
      };
    },
  },
];

/** Raster de contexto (Cloud Optimized GeoTIFF en R2, EPSG:3857). */
export interface ContextRasterConfigItem {
  id: string;
  file: string;
  title: string;
  source: string;
  group: ContextLayerGroup;
  defaultVisible: boolean;
  opacity: number;
}

export const INTEGRIDAD_RASTER: ContextRasterConfigItem = {
  id: 'integridad_ecosistemica',
  file: 'integridad_ecosistemica_2018.tif',
  title: 'Índice de Integridad Ecosistémica (2018)',
  source: 'CONABIO-INECOL, 250 m',
  group: 'Integridad ecosistémica',
  // Cubre todo el país: se deja apagada para no tapar las demás capas
  defaultVisible: false,
  opacity: 0.65,
};

/** Paleta del índice (0 = degradado, 1 = íntegro): se usa en el mapa y en la leyenda. */
export const INTEGRIDAD_COLOR_STOPS: [number, string][] = [
  [0, '#b91c1c'],
  [0.25, '#f97316'],
  [0.5, '#facc15'],
  [0.75, '#84cc16'],
  [1, '#15803d'],
];

const hexToRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Color interpolado de la paleta para un valor del índice (se recorta a 0–1). */
export const integridadColor = (value: number): string => {
  const v = Math.min(1, Math.max(0, value));
  for (let i = 1; i < INTEGRIDAD_COLOR_STOPS.length; i++) {
    const [v1, c1] = INTEGRIDAD_COLOR_STOPS[i];
    if (v <= v1) {
      const [v0, c0] = INTEGRIDAD_COLOR_STOPS[i - 1];
      const t = (v - v0) / (v1 - v0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      const mix = a.map((x, k) => Math.round(x + (b[k] - x) * t));
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
    }
  }
  return INTEGRIDAD_COLOR_STOPS[INTEGRIDAD_COLOR_STOPS.length - 1][1];
};

/** Capas de contexto encendidas al abrir el visor. */
export const DEFAULT_VISIBLE_CONTEXT_LAYERS: string[] = [
  ...ECO_LAYERS_CONFIG.filter((l) => l.defaultVisible).map((l) => l.id),
  ...(INTEGRIDAD_RASTER.defaultVisible ? [INTEGRIDAD_RASTER.id] : []),
];

/**
 * URL pública de un archivo en R2. Debe apuntar al mismo bucket que usa utils/fgbReader.
 * Configura VITE_R2_PUBLIC_URL en el .env del frontend (sin "/" al final).
 */
export const getR2FileUrl = (file: string): string => {
  const base = ((import.meta.env.VITE_R2_PUBLIC_URL as string | undefined) ?? '').replace(/\/+$/, '');
  return `${base}/${file}`;
};

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
    '#65a30d', '#16a34a', '#d97706', '#dc2626', '#2563eb', '#9333ea',
    '#db2777', '#ea580c', '#0284c7', '#059669', '#7c3aed', '#e11d48',
    '#15803d', '#ca8a04', '#0d9488', '#be123c', '#6d28d9', '#c026d3',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (str.codePointAt(i) ?? 0) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Paleta saturada para Uso de Suelo y Vegetación (INEGI)
export const getColorForVegetation = (str: string) => {
  const typeVeg = str.toUpperCase();
  const isSecundaria = typeVeg.includes('SECUNDARIA') || typeVeg.startsWith('V.S.');

  if (isSecundaria) {
    const isArbustivaOHerbacea =
      typeVeg.includes('ARBUSTIVA') || typeVeg.includes('HERBÁCEA') || typeVeg.includes('HERBACEA');

    if (typeVeg.includes('SELVA')) {
      return isArbustivaOHerbacea ? '#e879f9' : '#c084fc';
    }
    if (typeVeg.includes('BOSQUE')) {
      return isArbustivaOHerbacea ? '#86efac' : '#4ade80';
    }
    if (typeVeg.includes('MATORRAL')) {
      return '#fdba74';
    }
    if (typeVeg.includes('MANGLAR')) {
      return '#a78bfa';
    }
    return '#fb7185';
  }

  if (typeVeg.includes('AGRICULTURA')) return '#facc15';
  if (typeVeg.includes('BOSQUE')) return '#15803d';
  if (typeVeg.includes('SELVA')) return '#7e22ce';
  if (typeVeg.includes('MANGLAR')) return '#4c1d95';
  if (typeVeg.includes('PASTIZAL')) return '#84cc16';
  if (typeVeg.includes('MATORRAL')) return '#ea580c';
  if (typeVeg.includes('URBANA') || typeVeg.includes('ASENTAMIENTOS')) return '#64748b';
  if (typeVeg.includes('AGUA') || typeVeg.includes('ACUÍCOLA')) return '#2563eb';
  if (typeVeg.includes('DESPROVISTO')) return '#f472b6';

  return getHashColor(str);
};

// Paleta cartográfica para Unidades Climáticas (García - CONABIO)
export const getColorForClimate = (clave: string, tipoC: string): string => {
  const tipo = tipoC.toUpperCase();
  const c = clave.toUpperCase();

  if (tipo.includes('MUY SECO') || c.startsWith('BW')) return '#dc2626';
  if (tipo.includes('SEMISECO') || tipo.includes('SECO') || c.startsWith('BS')) return '#ea580c';
  if (tipo.includes('CÁLIDO HÚMEDO') || c.startsWith('AF') || c.startsWith('AM')) return '#15803d';
  if (tipo.includes('CÁLIDO SUBHÚMEDO') || c.startsWith('AW')) return '#65a30d';
  if (tipo.includes('SEMICÁLIDO') || c.startsWith('(A)C')) return '#eab308';
  if (tipo.includes('TEMPLADO HÚMEDO') || c.startsWith('CF') || c.startsWith('CM')) return '#0d9488';
  if (tipo.includes('TEMPLADO SUBHÚMEDO') || c.startsWith('CW')) return '#16a34a';
  if (tipo.includes('SEMIFRÍO') || c.includes('C(E)')) return '#2563eb';
  if (tipo.includes('FRÍO') || c.startsWith('E')) return '#4f46e5';

  return getHashColor(`${clave}-${tipoC}`);
};

// Paleta cartográfica saturada para Edafología INEGI Serie II (WRB)
export const getColorForEdafologia = (grupo: string): string => {
  const g = grupo.toUpperCase();

  if (g.includes('REGOSOL')) return '#eab308';
  if (g.includes('LEPTOSOL')) return '#78716c';
  if (g.includes('VERTISOL')) return '#44403c';
  if (g.includes('PHAEOZEM') || g.includes('FEOZEM')) return '#78350f';
  if (g.includes('CAMBISOL')) return '#d97706';
  if (g.includes('LUVISOL')) return '#dc2626';
  if (g.includes('CALCISOL')) return '#facc15';
  if (g.includes('ANDOSOL')) return '#7c3aed';
  if (g.includes('SOLONCHAK')) return '#db2777';
  if (g.includes('GLEYSOL')) return '#0284c7';
  if (g.includes('ARENOSOL')) return '#fb923c';
  if (g.includes('FLUVISOL')) return '#0ea5e9';
  if (g.includes('KASTANOZEM')) return '#92400e';
  if (g.includes('ACRISOL')) return '#ea580c';
  if (g.includes('PLANOSOL')) return '#64748b';
  if (g.includes('NITISOL')) return '#b91c1c';
  if (g.includes('HISTOSOL')) return '#3f6212';
  if (g.includes('AGUA')) return '#2563eb';
  if (g.includes('URBANA')) return '#64748b';

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

export interface StrahlerOrderStyle {
  order: number;
  label: string;
  color: string;
  weight: number;
  opacity: number;
}

export const STRAHLER_ORDER_CONFIG: StrahlerOrderStyle[] = [
  { order: 1, label: '1', color: '#0284c7', weight: 2.8, opacity: 1.0 },
  { order: 2, label: '2', color: '#0369a1', weight: 3.5, opacity: 1.0 },
  { order: 3, label: '3', color: '#1d4ed8', weight: 4.3, opacity: 1.0 },
  { order: 4, label: '4', color: '#1e40af', weight: 5.1, opacity: 1.0 },
  { order: 5, label: '5', color: '#1e3a8a', weight: 6.0, opacity: 1.0 },
  { order: 6, label: '6+', color: '#172554', weight: 6.8, opacity: 1.0 },
];

export const getStrahlerOrderNumber = (rawOrder: unknown): number => {
  const parsed = Number(rawOrder);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 6);
};

export const getStrahlerStyle = (rawOrder: unknown): StrahlerOrderStyle => {
  const orderNum = getStrahlerOrderNumber(rawOrder);
  return STRAHLER_ORDER_CONFIG[orderNum - 1] ?? STRAHLER_ORDER_CONFIG[0];
};

const EXCLUDED_ECO_KEYS = new Set([
  'ESTADO',
  'ESTADOS',
  'MUNICIPIO',
  'MUNICIPIOS',
  'REGION',
  'CATEGORIA',
  'CAT_MANEJO',
  'TIPO',
  'CLAVE',
  'FECHA',
  'FECHA_INGR',
  'NUM_RAMSAR',
  'NUMERO',
]);

export const getEcoSiteName = (props?: Record<string, unknown> | null): string | null => {
  if (!props) return null;

  // Nombre armado por la configuración de la capa (UGA, POE, corredores)
  const preset = props._siteName;
  if (typeof preset === 'string' && preset.trim().length > 0) return preset.trim();

  const priorityKeys = [
    'NOMBRE',
    'RAMSAR',
    'NOM_AICA',
    'NOM_RTP',
    'NOM_RHP',
    'NOM_ANP',
    'NOM_PREDIO',
    'SITIO',
    'NOM',
    'nombre',
    'Name',
    'NAME',
  ];

  for (const key of priorityKeys) {
    const val = props[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.replace(/\s+/g, ' ').trim();
    }
  }

  for (const [key, val] of Object.entries(props)) {
    if (key.startsWith('_')) continue;
    const upperKey = key.toUpperCase();
    if (EXCLUDED_ECO_KEYS.has(upperKey)) continue;
    if (
      /^(NOM|RAMSAR|AICA|RTP|RHP|ADVC|ANP|SITIO)/.test(upperKey) &&
      typeof val === 'string' &&
      val.trim().length > 0
    ) {
      return val.replace(/\s+/g, ' ').trim();
    }
  }

  return null;
};

export interface PolygonDistanceResult {
  intersects: boolean;
  distanceKm: number;
  label: string;
}

export function calcularDistanciaPoligono(
  userGeom: Feature<Polygon | MultiPolygon> | null,
  targetFeature: Feature
): PolygonDistanceResult | null {
  if (!userGeom || !targetFeature?.geometry) return null;

  try {
    if (turf.booleanIntersects(userGeom, targetFeature)) {
      return { intersects: true, distanceKm: 0, label: 'Intersecta' };
    }

    const extractLines = (feat: Feature) => {
      const { type } = feat.geometry;
      if (type === 'Polygon' || type === 'MultiPolygon') {
        return turf.flatten(turf.polygonToLine(feat as Feature<Polygon | MultiPolygon>)).features;
      }
      if (type === 'LineString' || type === 'MultiLineString') {
        return turf.flatten(feat as Feature<LineString | MultiLineString>).features;
      }
      return [];
    };

    const userLines = extractLines(userGeom);
    const targetLines = extractLines(targetFeature);
    const userPoints = turf.explode(userGeom).features;
    const targetPoints = turf.explode(targetFeature).features;

    let minKm = Infinity;

    // Vértices del polígono inspeccionado hacia bordes del sitio cercano
    for (const pt of userPoints) {
      for (const line of targetLines) {
        const d = turf.pointToLineDistance(pt, line, { units: 'kilometers' });
        if (d < minKm) minKm = d;
      }
    }

    // Vértices del sitio cercano hacia bordes del polígono inspeccionado
    for (const pt of targetPoints) {
      for (const line of userLines) {
        const d = turf.pointToLineDistance(pt, line, { units: 'kilometers' });
        if (d < minKm) minKm = d;
      }
    }

    // Respaldo si el sitio cercano es geometría puntual
    if (!Number.isFinite(minKm)) {
      for (const p1 of userPoints) {
        for (const p2 of targetPoints) {
          const d = turf.distance(p1, p2, { units: 'kilometers' });
          if (d < minKm) minKm = d;
        }
      }
    }

    if (!Number.isFinite(minKm)) return null;

    const label =
      minKm < 1 ? `${Math.round(minKm * 1000)} m` : `${minKm.toFixed(2)} km`;

    return { intersects: false, distanceKm: minKm, label };
  } catch {
    return null;
  }
}
// ---------------- Unidades de superficie ----------------
// Los valores se guardan siempre en m²; la unidad solo afecta cómo se muestran y editan.
export type AreaUnit = 'ha' | 'm2';

export const M2_PER_HA = 10000;

/** Convierte un texto en m² (admite separador de miles con coma) a número. */
export const parseAreaM2 = (value: string | number): number =>
  typeof value === 'number' ? value : Number.parseFloat(value.replace(/,/g, '').trim());

/** Valor en m² → texto en la unidad pedida (sin sufijo), listo para un input editable. */
export const m2ToUnitInput = (valueM2: string, unit: AreaUnit): string => {
  const v = parseAreaM2(valueM2);
  if (!Number.isFinite(v)) return valueM2;
  return unit === 'ha' ? (v / M2_PER_HA).toFixed(4) : v.toFixed(2);
};

/** Texto escrito en la unidad pedida → texto en m². Si no es número se devuelve tal cual. */
export const unitInputToM2 = (value: string, unit: AreaUnit): string => {
  const v = parseAreaM2(value);
  if (!Number.isFinite(v)) return value;
  return (unit === 'ha' ? v * M2_PER_HA : v).toFixed(2);
};

/** Valor en m² → texto formateado con unidad: "1.2345 ha" o "12,345.00 m²". */
export const formatArea = (valueM2: string | number, unit: AreaUnit): string => {
  const v = parseAreaM2(valueM2);
  if (!Number.isFinite(v)) return String(valueM2);
  if (unit === 'ha') {
    return `${(v / M2_PER_HA).toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha`;
  }
  return `${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
};