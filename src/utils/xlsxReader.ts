/* ============================================================================
 * Lector mínimo de Excel (.xlsx) sin dependencias.
 *
 * Un .xlsx es un ZIP con XML. Se descomprime con DecompressionStream('deflate-raw')
 * (nativo en Chrome/Edge 80+, Firefox 113+, Safari 16.4+) y se leen la primera hoja
 * con datos y las cadenas compartidas. Devuelve la misma estructura que parseCsv,
 * así el resto del importador no distingue entre CSV y Excel.
 *
 * Alcance: valores de celda (texto, números, booleanos, resultados de fórmulas).
 * No lee formatos, fechas como fecha ni archivos .xls (binario antiguo).
 * ========================================================================== */

import type { CsvTable } from './featureTools';

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readZipDirectory(view: DataView): ZipEntry[] {
  // Fin del directorio central: firma 0x06054b50 en los últimos 64 KB
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un Excel .xlsx válido.');

  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + ptr + 46, nameLen));
    entries.push({ name, method, compressedSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buffer: ArrayBuffer, view: DataView, entry: ZipEntry): Promise<string> {
  const nameLen = view.getUint16(entry.localOffset + 26, true);
  const extraLen = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  const raw = new Uint8Array(buffer, start, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) throw new Error(`Compresión no soportada en el Excel (método ${entry.method}).`);

  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Texto de todos los <t> dentro de un fragmento (cubre texto enriquecido con varios runs). */
const joinTextRuns = (xml: string) =>
  Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
    .map((m) => decodeXml(m[1]))
    .join('');

function parseSharedStrings(xml: string): string[] {
  return Array.from(xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)).map((m) => joinTextRuns(m[1]));
}

/** "AB12" → índice de columna base 0 (AB → 27). */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): { row: number; cells: string[] }[] {
  const rows: { row: number; cells: string[] }[] = [];
  let rowCounter = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    rowCounter++;
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1]) || rowCounter;
    const cells: string[] = [];
    let nextCol = 0;
    for (const c of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];

      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = joinTextRuns(body);
      else if (type === 'b' && v !== undefined) value = v === '1' ? 'VERDADERO' : 'FALSO';
      else if (v !== undefined) value = decodeXml(v);

      while (cells.length < col) cells.push('');
      cells[col] = value.trim();
    }
    if (cells.some((v) => v !== '')) rows.push({ row: rowNumber, cells });
  }
  return rows;
}

/** Hojas en el orden del libro → ruta de su XML dentro del ZIP. */
function resolveSheetPaths(workbookXml: string, relsXml: string): { name: string; path: string }[] {
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets.set(id, target);
  }
  const sheets: { name: string; path: string }[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decodeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1] ?? /\bid="([^"]+)"/.exec(m[1])?.[1];
    const target = rid ? targets.get(rid) : undefined;
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    sheets.push({ name, path });
  }
  return sheets;
}

export interface XlsxTable extends CsvTable {
  sheetName: string;
}

/**
 * Lee la primera hoja con datos de un .xlsx (normalmente "Coordenadas" en las plantillas).
 * La primera fila con contenido se toma como encabezados.
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<XlsxTable> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede leer Excel. Actualízalo o guarda el archivo como CSV.');
  }
  const view = new DataView(buffer);
  const entries = readZipDirectory(view);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const read = async (name: string) => {
    const entry = byName.get(name);
    return entry ? await readEntry(buffer, view, entry) : '';
  };

  const [workbookXml, relsXml, sharedXml] = await Promise.all([
    read('xl/workbook.xml'),
    read('xl/_rels/workbook.xml.rels'),
    read('xl/sharedStrings.xml'),
  ]);
  if (!workbookXml) throw new Error('El archivo no es un Excel .xlsx válido.');
  const shared = parseSharedStrings(sharedXml);

  let sheets = resolveSheetPaths(workbookXml, relsXml);
  if (sheets.length === 0) sheets = [{ name: 'Hoja1', path: 'xl/worksheets/sheet1.xml' }];

  // Hoja "Coordenadas" primero; "Instrucciones" (de las plantillas) nunca se toma como datos
  const norm = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const ordered = [
    ...sheets.filter((sh) => norm(sh.name) === 'coordenadas'),
    ...sheets.filter((sh) => !['coordenadas', 'instrucciones'].includes(norm(sh.name))),
  ];

  for (const sheet of ordered) {
    const rows = parseSheet(await read(sheet.path), shared);
    if (rows.length < 2) continue;
    const [headerRow, ...body] = rows;
    const width = Math.max(...rows.map((r) => r.cells.length));
    const headers = Array.from({ length: width }, (_, i) => headerRow.cells[i]?.trim() || `Columna_${i + 1}`);
    return {
      sheetName: sheet.name,
      headers,
      delimiter: '',
      rows: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r.cells[i] ?? '']))),
      rowNumbers: body.map((r) => r.row),
    };
  }
  throw new Error('El Excel no tiene datos (se necesita una fila de encabezados y al menos una fila de coordenadas).');
}
