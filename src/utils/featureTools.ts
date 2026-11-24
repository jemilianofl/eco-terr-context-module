import * as turf from '@turf/turf';
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  MultiLineString,
  Point,
  Polygon,
  Position,
} from 'geojson';
import { formatArea } from '../config/mapConfig';
import { DATUMS, type DatumId, toWgs84, utmToLonLat } from './datum';

/* ============================================================================
 * Herramientas para preparar lo que sube el usuario antes de graficarlo:
 * explode (multipartes / vértices), agrupar vértices en polígonos, CSV de puntos
 * (grados decimales, GMS o UTM) y etiquetado final (A, B, … / V1, V2, …).
 * ========================================================================== */

export type AnyFeature = Feature<Geometry, GeoJsonProperties>;
export type GeometryKind = 'polygon' | 'line' | 'point' | 'other';

const UID_KEY = '_uid';
let uidCounter = 0;
const nextUid = () => `f${(uidCounter++).toString(36)}`;

export const getUid = (f: AnyFeature): string => String(f.properties?.[UID_KEY] ?? '');

export function withUid(f: AnyFeature): AnyFeature {
  return { ...f, properties: { ...(f.properties ?? {}), [UID_KEY]: nextUid() } };
}

export function geometryKind(f: AnyFeature): GeometryKind {
  switch (f.geometry?.type) {
    case 'Polygon':
    case 'MultiPolygon':
      return 'polygon';
    case 'LineString':
    case 'MultiLineString':
      return 'line';
    case 'Point':
    case 'MultiPoint':
      return 'point';
    default:
      return 'other';
  }
}

const TYPE_LABELS: Record<string, string> = {
  Polygon: 'Polígono',
  MultiPolygon: 'Multipolígono',
  LineString: 'Línea',
  MultiLineString: 'Multilínea',
  Point: 'Punto',
  MultiPoint: 'Multipunto',
  GeometryCollection: 'Colección',
};

export const geometryTypeLabel = (f: AnyFeature) => TYPE_LABELS[f.geometry?.type ?? ''] ?? 'Desconocido';

export const isMultipart = (f: AnyFeature) =>
  ['MultiPolygon', 'MultiLineString', 'MultiPoint', 'GeometryCollection'].includes(f.geometry?.type ?? '');

const NAME_KEYS = ['NOMBRE', 'Nombre', 'nombre', 'NAME', 'Name', 'name', 'ID', 'Id', 'id', 'CLAVE', 'VERTICE', 'Vertice', 'vertice'];

export function featureDisplayName(f: AnyFeature): string {
  const p = f.properties ?? {};
  for (const k of NAME_KEYS) {
    const v: unknown = p[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

export function featureDetail(f: AnyFeature): string {
  try {
    const kind = geometryKind(f);
    if (kind === 'polygon') return formatArea(turf.area(f), 'ha');
    if (kind === 'line') {
      const km = turf.length(f as Feature<LineString | MultiLineString>, { units: 'kilometers' });
      return km >= 1 ? `${km.toFixed(3)} km` : `${(km * 1000).toFixed(1)} m`;
    }
    if (f.geometry?.type === 'Point') {
      const [lon, lat] = f.geometry.coordinates;
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
    if (f.geometry?.type === 'MultiPoint') return `${f.geometry.coordinates.length} puntos`;
  } catch {
    /* geometría inválida */
  }
  return '';
}

/** Llaves de atributos visibles (sin las internas que empiezan con "_"). */
export function propertyKeys(features: AnyFeature[]): string[] {
  const keys = new Set<string>();
  features.forEach((f) => Object.keys(f.properties ?? {}).forEach((k) => !k.startsWith('_') && keys.add(k)));
  return Array.from(keys);
}

/* ----------------------------- EXPLODE ----------------------------------- */

/** Separa multipartes (MultiPolygon, MultiLineString, MultiPoint, GeometryCollection) en elementos individuales. */
export function explodeMultipart(features: AnyFeature[]): { features: AnyFeature[]; parentOf: Map<string, string> } {
  const out: AnyFeature[] = [];
  const parentOf = new Map<string, string>();
  features.forEach((f) => {
    if (!isMultipart(f)) {
      out.push(f);
      return;
    }
    const parentUid = getUid(f);
    const baseName = featureDisplayName(f);
    const parts = turf.flatten(turf.featureCollection([f])).features as AnyFeature[];
    parts.forEach((part, i) => {
      const child = withUid({
        ...part,
        properties: { ...(f.properties ?? {}), _parte: i + 1, _origen: baseName || parentUid },
      });
      parentOf.set(getUid(child), parentUid);
      out.push(child);
    });
  });
  return { features: out, parentOf };
}

/** Extrae los vértices de polígonos y líneas como puntos numerados (sin repetir el vértice de cierre). */
export function extractVertices(features: AnyFeature[]): AnyFeature[] {
  const out: AnyFeature[] = [];
  features.forEach((f) => {
    const kind = geometryKind(f);
    if (kind !== 'polygon' && kind !== 'line') return;
    const parentName = featureDisplayName(f) || String(f.properties?.polyId ?? '');
    const rings: Position[][] = [];
    const g = f.geometry;
    if (g.type === 'Polygon') g.coordinates.forEach((r) => rings.push(r.slice(0, -1)));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((r) => rings.push(r.slice(0, -1))));
    else if (g.type === 'LineString') rings.push(g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach((l) => rings.push(l));

    let n = 1;
    rings.forEach((ring) =>
      ring.forEach((coord) => {
        out.push(
          withUid(
            turf.point([coord[0], coord[1]], {
              VERTICE: n++,
              ELEMENTO: parentName,
              LATITUD: Number(coord[1].toFixed(6)),
              LONGITUD: Number(coord[0].toFixed(6)),
            }),
          ),
        );
      }),
    );
  });
  return out;
}

/* ------------------------ AGRUPAR VÉRTICES ------------------------------- */

export interface GroupOptions {
  /** Atributo que identifica a qué polígono pertenece cada vértice ('' = todos en uno solo). */
  groupField: string;
  /** Atributo con el orden del vértice ('' = orden en que vienen en el archivo). */
  orderField: string;
  output: 'polygon' | 'line';
}

export interface GroupResult {
  features: AnyFeature[];
  skipped: string[];
  warnings: string[];
}

/** Convierte un valor de atributo a texto sin caer en "[object Object]". */
const scalarToText = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
};

const compareValues = (a: unknown, b: unknown) => {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return scalarToText(a).localeCompare(scalarToText(b), 'es', { numeric: true });
};

export function groupPointsIntoShapes(points: AnyFeature[], opts: GroupOptions): GroupResult {
  const groups = new Map<string, { idx: number; f: Feature<Point> }[]>();
  points.forEach((f, idx) => {
    if (f.geometry?.type !== 'Point') return;
    const key = opts.groupField ? scalarToText(f.properties?.[opts.groupField]) || '(sin valor)' : 'Polígono';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ idx, f: f as Feature<Point> });
  });

  const result: GroupResult = { features: [], skipped: [], warnings: [] };
  const minVertices = opts.output === 'polygon' ? 3 : 2;

  groups.forEach((members, key) => {
    const ordered = [...members].sort((a, b) =>
      opts.orderField ? compareValues(a.f.properties?.[opts.orderField], b.f.properties?.[opts.orderField]) || a.idx - b.idx : a.idx - b.idx,
    );
    const coords = ordered.map((m) => m.f.geometry.coordinates.slice(0, 2));
    // Quita duplicados consecutivos
    const clean = coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1]);
    if (clean.length > 1 && clean[0][0] === clean[clean.length - 1][0] && clean[0][1] === clean[clean.length - 1][1]) {
      clean.pop();
    }

    if (clean.length < minVertices) {
      result.skipped.push(`${key} (${clean.length} vértice${clean.length === 1 ? '' : 's'})`);
      return;
    }

    const props: GeoJsonProperties = {
      ...(opts.groupField ? { [opts.groupField]: key } : {}),
      NOMBRE: opts.groupField ? key : 'Polígono',
      NUM_VERTICES: clean.length,
    };

    if (opts.output === 'line') {
      result.features.push(withUid(turf.lineString(clean, props)));
      return;
    }

    const poly = turf.polygon([[...clean, clean[0]]], props) as Feature<Polygon>;
    try {
      if (turf.kinks(poly).features.length > 0) {
        result.warnings.push(`${key}: el polígono se cruza a sí mismo; revisa el orden de los vértices.`);
      }
    } catch {
      /* ignorar */
    }
    result.features.push(withUid(poly));
  });

  return result;
}

/* ------------------------------- CSV ------------------------------------- */

export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function parseCsv(text: string): CsvTable {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t', '|'];
  const delimiter = candidates.reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      record.push(field);
      if (record.some((v) => v.trim() !== '')) records.push(record);
      record = [];
      field = '';
    } else field += ch;
  }
  record.push(field);
  if (record.some((v) => v.trim() !== '')) records.push(record);

  const [headerRow = [], ...body] = records;
  const headers = headerRow.map((h, i) => h.trim() || `Columna_${i + 1}`);
  const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows, delimiter };
}

/**
 * Convierte un texto de coordenada a número. Acepta:
 * "-90.2313", "-90,2313" (coma decimal), "90°13'52.8\"W", "17 55 50 N", "O 90°13'52.8".
 */
export function parseCoordinate(raw: string): number {
  const s = raw.trim();
  if (!s) return Number.NaN;
  if (/^[-+]?\d+(,\d+)?$/.test(s)) return Number.parseFloat(s.replace(',', '.'));
  if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return Number.parseFloat(s);

  // Hemisferio solo como letra suelta al inicio o al final ("O 90°…", "…52.8\"W")
  const hemiMatch = /^\s*([NSEWO])(?![a-z])|([NSEWO])\s*$/i.exec(s);
  const hemiLetter = (hemiMatch?.[1] ?? hemiMatch?.[2] ?? '').toUpperCase();
  const hemi = hemiLetter === 'S' || hemiLetter === 'W' || hemiLetter === 'O';
  const nums = s.replace(',', '.').match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return Number.NaN;
  const [d, m = '0', sec = '0'] = nums;
  let value = Number(d) + Number(m) / 60 + Number(sec) / 3600;
  if (s.trim().startsWith('-') || hemi) value = -value;
  return value;
}

const normalizeHeader = (h: string) =>
  h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_\-.()[\]]/g, '');

const LON_NAMES = ['lon', 'long', 'lng', 'longitud', 'longitude', 'x', 'este', 'easting', 'coordx', 'xutm', 'utmx', 'e'];
const LAT_NAMES = ['lat', 'latitud', 'latitude', 'y', 'norte', 'northing', 'coordy', 'yutm', 'utmy', 'n'];

export type CsvCrs = 'wgs84' | 'utm';

export interface CsvPointConfig {
  xColumn: string;
  yColumn: string;
  crs: CsvCrs;
  utmZone: number;
  hemisphere: 'N' | 'S';
  /** Datum en el que vienen las coordenadas del CSV; se transforman a WGS84 para graficar. */
  datum: DatumId;
}

export function detectCsvConfig(table: CsvTable, datum: DatumId = 'WGS84'): CsvPointConfig {
  const find = (names: string[]) =>
    table.headers.find((h) => names.includes(normalizeHeader(h))) ??
    table.headers.find((h) => names.some((n) => n.length > 2 && normalizeHeader(h).includes(n))) ??
    '';
  const xColumn = find(LON_NAMES) || table.headers[0] || '';
  const yColumn = find(LAT_NAMES) || table.headers[1] || '';
  const sample = table.rows.slice(0, 20).map((r) => Math.abs(parseCoordinate(r[xColumn] ?? '')));
  const looksUtm = sample.some((v) => Number.isFinite(v) && v > 180);
  return { xColumn, yColumn, crs: looksUtm ? 'utm' : 'wgs84', utmZone: 15, hemisphere: 'N', datum };
}

export interface CsvToPointsResult {
  features: AnyFeature[];
  invalidRows: number[];
}

export function csvToPoints(table: CsvTable, cfg: CsvPointConfig): CsvToPointsResult {
  const features: AnyFeature[] = [];
  const invalidRows: number[] = [];

  table.rows.forEach((row, i) => {
    const xv = parseCoordinate(row[cfg.xColumn] ?? '');
    const yv = parseCoordinate(row[cfg.yColumn] ?? '');
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
      invalidRows.push(i + 2); // +2: encabezado y base 1, como lo ve el usuario en Excel
      return;
    }
    let lon = xv;
    let lat = yv;
    if (cfg.crs === 'utm') [lon, lat] = utmToLonLat(xv, yv, cfg.utmZone, cfg.hemisphere, DATUMS[cfg.datum].ellipsoid);
    else if (Math.abs(xv) <= 90 && Math.abs(yv) > 90) [lon, lat] = [yv, xv]; // columnas invertidas
    [lon, lat] = toWgs84(lon, lat, cfg.datum);

    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      invalidRows.push(i + 2);
      return;
    }
    const props: GeoJsonProperties = { ...row, _fila: i + 2, _datumOrigen: cfg.datum };
    features.push(withUid(turf.point([Number(lon.toFixed(7)), Number(lat.toFixed(7))], props)));
  });

  return { features, invalidRows };
}

/* --------------------------- ETIQUETADO ---------------------------------- */

/** 0 → A, 25 → Z, 26 → AA, 27 → AB … (antes pasaba de Z a "[" con más de 26 polígonos). */
export function letterLabel(index: number): string {
  let n = index;
  let label = '';
  do {
    label = String.fromCodePoint(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Prepara la colección final: polígonos/líneas → polyId A, B, …; puntos → _label V1, V2, …
 * (o el número de VERTICE si existe). Quita la llave interna _uid.
 */
export function finalizeCollection(features: AnyFeature[]): FeatureCollection {
  let polyIndex = 0;
  let pointIndex = 0;
  const out = features.map((f) => {
    const props: Record<string, unknown> = { ...(f.properties ?? {}) };
    delete props[UID_KEY];
    const kind = geometryKind(f);
    if (kind === 'point') {
      pointIndex++;
      const vertex = scalarToText(props.VERTICE ?? props.Vertice ?? props.vertice);
      props._label = vertex ? `V${vertex}` : `V${pointIndex}`;
      delete props.polyId;
    } else {
      props.polyId = letterLabel(polyIndex++);
    }
    const finalFeature: AnyFeature = { ...f, properties: props };
    return finalFeature;
  });
  return { type: 'FeatureCollection', features: out };
}

/** ¿Conviene abrir el gestor? (puntos, multipartes, tipos mezclados o varios elementos). */
export function needsElementReview(fc: FeatureCollection): boolean {
  const kinds = new Set(fc.features.map((f) => geometryKind(f)));
  return (
    kinds.has('point') ||
    kinds.size > 1 ||
    fc.features.some((f) => isMultipart(f)) ||
    fc.features.length > 1
  );
}
