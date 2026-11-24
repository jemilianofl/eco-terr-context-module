import type { FeatureCollection } from 'geojson';
import { getGisBackendUrl } from './gisApiClient';
import type { DatumId } from './datum';

/** Respuesta de POST /gis/parse-table (ver ParseTableResponseDto en el backend). */
export interface ParseTableResponse {
  success: boolean;
  fileName: string;
  sheetName?: string;
  headers: string[];
  rowCount: number;
  template: 'geo' | 'utm' | null;
  datum: string;
  featureCollection?: FeatureCollection;
  polygonCount?: number;
  vertexCount?: number;
  rows?: Record<string, string>[];
  rowNumbers?: number[];
  errors: { row: number | null; message: string }[];
  warnings: string[];
}

/** El backend no respondió (caído, sin red o error 5xx): para CSV se usa el lector del navegador. */
export class TableBackendUnavailableError extends Error {}

export const TABLE_FILE_PATTERN = /\.(csv|txt|xlsx|xlsm|xls)$/i;
export const isSpreadsheetFile = (name: string) => /\.(xlsx|xlsm|xls)$/i.test(name);

export async function parseTableViaBackend(
  file: File,
  options: { datum: DatumId; utmZone?: number; hemisphere?: 'N' | 'S' },
): Promise<ParseTableResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('datum', options.datum);
  if (options.utmZone) form.append('utmZone', String(options.utmZone));
  if (options.hemisphere) form.append('hemisphere', options.hemisphere);

  let res: Response;
  try {
    res = await fetch(`${getGisBackendUrl().replace(/\/$/, '')}/gis/parse-table`, { method: 'POST', body: form });
  } catch (err) {
    throw new TableBackendUnavailableError(err instanceof Error ? err.message : 'Sin conexión con el servidor');
  }

  if (res.status >= 500 || res.status === 404) {
    throw new TableBackendUnavailableError(`El servidor respondió ${res.status}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new Error(msg ?? `No se pudo leer la tabla (HTTP ${res.status}).`);
  }
  return (await res.json()) as ParseTableResponse;
}

/** Resume errores y avisos del backend en texto para el gestor de elementos. */
export function describeTableIssues(res: ParseTableResponse): string | null {
  const lines: string[] = [];
  if (res.template) {
    lines.push(
      `Plantilla ${res.template === 'utm' ? 'UTM' : 'geográfica'} reconocida (datum ${res.datum}): ` +
        `${res.polygonCount ?? 0} polígono(s) y ${res.vertexCount ?? 0} vértice(s) de ${res.rowCount} fila(s).`,
    );
  }
  res.errors.slice(0, 20).forEach((e) => lines.push(`⚠ ${e.row ? `Fila ${e.row}: ` : ''}${e.message}`));
  if (res.errors.length > 20) lines.push(`… y ${res.errors.length - 20} error(es) más.`);
  res.warnings.slice(0, 10).forEach((w) => lines.push(`• ${w}`));
  return lines.length ? lines.join('\n') : null;
}
