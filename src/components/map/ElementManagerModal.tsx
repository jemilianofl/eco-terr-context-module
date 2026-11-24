import React, { useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import {
  type AnyFeature,
  type CsvPointConfig,
  type GeometryKind,
  type GroupOptions,
  csvToPoints,
  detectCsvConfig,
  explodeMultipart,
  extractVertices,
  featureDetail,
  featureDisplayName,
  finalizeCollection,
  geometryKind,
  geometryTypeLabel,
  getUid,
  groupPointsIntoShapes,
  isMultipart,
  parseCsv,
  propertyKeys,
  withUid,
} from '../../utils/featureTools';

export type ElementSource =
  | { id: number; kind: 'csv'; fileName: string; text: string }
  | { id: number; kind: 'geojson'; fileName: string; collection: FeatureCollection };

interface ElementManagerModalProps {
  source: ElementSource;
  onClose: () => void;
  onApply: (collection: FeatureCollection) => void;
}

const KIND_ICON: Record<GeometryKind, string> = {
  polygon: 'bi-pentagon',
  line: 'bi-slash-lg',
  point: 'bi-dot',
  other: 'bi-question-circle',
};

const brand = '#163f37';
const smallLabel: React.CSSProperties = { fontSize: '0.72rem' };

/* ---------------------- Paso 1: configuración de CSV --------------------- */

const CsvStep: React.FC<{
  fileName: string;
  text: string;
  onConverted: (features: AnyFeature[], invalidRows: number[]) => void;
  onClose: () => void;
}> = ({ fileName, text, onConverted, onClose }) => {
  const table = useMemo(() => parseCsv(text), [text]);
  const [cfg, setCfg] = useState<CsvPointConfig>(() => detectCsvConfig(table));
  const preview = table.rows.slice(0, 5);

  const set = <K extends keyof CsvPointConfig>(key: K, value: CsvPointConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <div className="p-3">
        <p className="mb-2" style={smallLabel}>
          <strong>{fileName}</strong> — {table.rows.length} filas, {table.headers.length} columnas. Indica qué columnas tienen
          las coordenadas:
        </p>

        <div className="row g-2 mb-3">
          <div className="col-sm-3">
            <label htmlFor="csvX" className="form-label fw-semibold mb-1" style={smallLabel}>
              {cfg.crs === 'utm' ? 'Este (X)' : 'Longitud (X)'}
            </label>
            <select id="csvX" className="form-select form-select-sm" value={cfg.xColumn} onChange={(e) => set('xColumn', e.target.value)}>
              {table.headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="col-sm-3">
            <label htmlFor="csvY" className="form-label fw-semibold mb-1" style={smallLabel}>
              {cfg.crs === 'utm' ? 'Norte (Y)' : 'Latitud (Y)'}
            </label>
            <select id="csvY" className="form-select form-select-sm" value={cfg.yColumn} onChange={(e) => set('yColumn', e.target.value)}>
              {table.headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="col-sm-3">
            <label htmlFor="csvCrs" className="form-label fw-semibold mb-1" style={smallLabel}>
              Sistema de coordenadas
            </label>
            <select id="csvCrs" className="form-select form-select-sm" value={cfg.crs} onChange={(e) => set('crs', e.target.value as CsvPointConfig['crs'])}>
              <option value="wgs84">Geográficas WGS84 (grados / GMS)</option>
              <option value="utm">UTM WGS84 (metros)</option>
            </select>
          </div>
          {cfg.crs === 'utm' && (
            <div className="col-sm-3">
              <label htmlFor="csvZone" className="form-label fw-semibold mb-1" style={smallLabel}>
                Zona UTM
              </label>
              <div className="d-flex gap-1">
                <select id="csvZone" className="form-select form-select-sm" value={cfg.utmZone} onChange={(e) => set('utmZone', Number(e.target.value))}>
                  {Array.from({ length: 60 }, (_, i) => i + 1).map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
                <select
                  aria-label="Hemisferio"
                  className="form-select form-select-sm"
                  style={{ maxWidth: '70px' }}
                  value={cfg.hemisphere}
                  onChange={(e) => set('hemisphere', e.target.value as 'N' | 'S')}
                >
                  <option value="N">N</option>
                  <option value="S">S</option>
                </select>
              </div>
              <div className="text-muted mt-1" style={{ fontSize: '0.62rem' }}>
                México: zonas 11 a 16 (Campeche/Yucatán: 15 y 16).
              </div>
            </div>
          )}
        </div>

        <div className="table-responsive border rounded" style={{ maxHeight: '180px' }}>
          <table className="table table-sm mb-0" style={{ fontSize: '0.68rem' }}>
            <thead className="table-light">
              <tr>
                {table.headers.map((h) => (
                  <th
                    key={h}
                    style={{
                      whiteSpace: 'nowrap',
                      backgroundColor: h === cfg.xColumn || h === cfg.yColumn ? '#d1e7dd' : undefined,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i}>
                  {table.headers.map((h) => (
                    <td key={h} style={{ whiteSpace: 'nowrap' }}>{r[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.62rem' }}>
          Formatos aceptados: -90.2313 · -90,2313 · 90°13'52.8"W · O 90 13 52.8 · metros UTM.
        </p>
      </div>

      <div className="d-flex justify-content-end gap-2 p-3 border-top">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-sm text-white fw-bold"
          style={{ backgroundColor: brand }}
          disabled={!cfg.xColumn || !cfg.yColumn || cfg.xColumn === cfg.yColumn}
          onClick={() => {
            const { features, invalidRows } = csvToPoints(table, cfg);
            onConverted(features, invalidRows);
          }}
        >
          Convertir a puntos <i className="bi bi-arrow-right ms-1"></i>
        </button>
      </div>
    </>
  );
};

/* ---------------------- Paso 2: gestor de elementos ---------------------- */

const ElementsStep: React.FC<{
  initialFeatures: AnyFeature[];
  initialNotice: string | null;
  onApply: (collection: FeatureCollection) => void;
  onClose: () => void;
}> = ({ initialFeatures, initialNotice, onApply, onClose }) => {
  const [features, setFeatures] = useState<AnyFeature[]>(initialFeatures);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialFeatures.map(getUid)));
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [group, setGroup] = useState<GroupOptions>({ groupField: '', orderField: '', output: 'polygon' });

  const counts = useMemo(() => {
    const c: Record<GeometryKind, number> = { polygon: 0, line: 0, point: 0, other: 0 };
    features.forEach((f) => c[geometryKind(f)]++);
    return c;
  }, [features]);

  const multipartCount = useMemo(() => features.filter(isMultipart).length, [features]);
  const pointKeys = useMemo(() => propertyKeys(features.filter((f) => geometryKind(f) === 'point')), [features]);
  const selectedCount = features.filter((f) => selected.has(getUid(f))).length;

  const selectKinds = (kinds: GeometryKind[] | 'all' | 'none') => {
    if (kinds === 'none') return setSelected(new Set());
    setSelected(new Set(features.filter((f) => kinds === 'all' || kinds.includes(geometryKind(f))).map(getUid)));
  };

  const toggle = (uid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const handleExplode = () => {
    const { features: exploded, parentOf } = explodeMultipart(features);
    const nextSelected = new Set<string>();
    exploded.forEach((f) => {
      const uid = getUid(f);
      const parent = parentOf.get(uid);
      if (selected.has(parent ?? uid)) nextSelected.add(uid);
    });
    setFeatures(exploded);
    setSelected(nextSelected);
    setNotice(`Se separaron ${multipartCount} elemento(s) multiparte en ${exploded.length - (features.length - multipartCount)} partes individuales.`);
  };

  const handleExtractVertices = () => {
    const sources = features.filter((f) => {
      const k = geometryKind(f);
      return (k === 'polygon' || k === 'line') && selected.has(getUid(f));
    });
    const base = sources.length > 0 ? sources : features.filter((f) => ['polygon', 'line'].includes(geometryKind(f)));
    const vertices = extractVertices(base);
    if (vertices.length === 0) return;
    setFeatures((prev) => [...prev, ...vertices]);
    setSelected((prev) => new Set([...prev, ...vertices.map(getUid)]));
    setNotice(`Se agregaron ${vertices.length} vértices de ${base.length} elemento(s).`);
  };

  const handleGroup = () => {
    const points = features.filter((f) => geometryKind(f) === 'point');
    const selectedPoints = points.filter((f) => selected.has(getUid(f)));
    const source = selectedPoints.length > 0 ? selectedPoints : points;
    const result = groupPointsIntoShapes(source, group);
    if (result.features.length === 0) {
      setNotice(`No se pudo formar ningún ${group.output === 'polygon' ? 'polígono (mínimo 3 vértices)' : 'trazo (mínimo 2 vértices)'}.`);
      return;
    }
    setFeatures((prev) => [...result.features, ...prev]);
    setSelected((prev) => new Set([...prev, ...result.features.map(getUid)]));
    const parts = [`Se formaron ${result.features.length} ${group.output === 'polygon' ? 'polígono(s)' : 'trazo(s)'} con ${source.length} vértices.`];
    if (result.skipped.length) parts.push(`Omitidos por pocos vértices: ${result.skipped.join(', ')}.`);
    if (result.warnings.length) parts.push(result.warnings.join(' '));
    setNotice(parts.join(' '));
  };

  const handleReset = () => {
    setFeatures(initialFeatures);
    setSelected(new Set(initialFeatures.map(getUid)));
    setNotice('Se restauraron los elementos originales del archivo.');
  };

  const handleApply = () => {
    const chosen = features.filter((f) => selected.has(getUid(f)));
    if (chosen.length === 0) return;
    onApply(finalizeCollection(chosen));
  };

  return (
    <>
      <div className="p-3">
        {/* Resumen + selección rápida */}
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2" style={smallLabel}>
          <span className="fw-semibold">Contenido:</span>
          {counts.polygon > 0 && <span className="badge text-bg-light border">{counts.polygon} polígono(s)</span>}
          {counts.line > 0 && <span className="badge text-bg-light border">{counts.line} línea(s)</span>}
          {counts.point > 0 && <span className="badge text-bg-light border">{counts.point} punto(s)</span>}
          {counts.other > 0 && <span className="badge text-bg-light border">{counts.other} otro(s)</span>}
          {multipartCount > 0 && <span className="badge text-bg-warning">{multipartCount} multiparte</span>}
        </div>

        <div className="d-flex flex-wrap gap-1 mb-3">
          <span className="fw-semibold me-1 align-self-center" style={smallLabel}>Graficar:</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => selectKinds('all')}>Todo</button>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={counts.polygon === 0} onClick={() => selectKinds(['polygon'])}>
            Solo polígonos
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={counts.point === 0} onClick={() => selectKinds(['point'])}>
            Solo puntos
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={counts.line === 0} onClick={() => selectKinds(['line'])}>
            Solo líneas
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={counts.polygon === 0 || counts.point === 0}
            onClick={() => selectKinds(['polygon', 'point'])}
          >
            Polígonos + vértices
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => selectKinds('none')}>Ninguno</button>
        </div>

        {/* Herramientas */}
        <div className="row g-2 mb-3">
          <div className="col-md-5">
            <div className="border rounded p-2 h-100">
              <div className="fw-bold mb-1" style={smallLabel}><i className="bi bi-scissors me-1"></i>Separar (explode)</div>
              <div className="d-flex flex-wrap gap-1">
                <button type="button" className="btn btn-sm btn-outline-dark" disabled={multipartCount === 0} onClick={handleExplode}
                  title="Convierte cada multipolígono / multilínea / multipunto en elementos independientes">
                  Separar multipartes
                </button>
                <button type="button" className="btn btn-sm btn-outline-dark" disabled={counts.polygon + counts.line === 0} onClick={handleExtractVertices}
                  title="Agrega los vértices numerados de los polígonos/líneas seleccionados como puntos">
                  Extraer vértices
                </button>
              </div>
            </div>
          </div>

          <div className="col-md-7">
            <div className="border rounded p-2 h-100">
              <div className="fw-bold mb-1" style={smallLabel}><i className="bi bi-bounding-box-circles me-1"></i>Agrupar vértices en polígonos</div>
              <div className="d-flex flex-wrap gap-1 align-items-end">
                <div>
                  <label htmlFor="grpField" className="form-label mb-0" style={{ fontSize: '0.62rem' }}>Agrupar por</label>
                  <select id="grpField" className="form-select form-select-sm" value={group.groupField} disabled={counts.point === 0}
                    onChange={(e) => setGroup((g) => ({ ...g, groupField: e.target.value }))}>
                    <option value="">(todos en uno)</option>
                    {pointKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="grpOrder" className="form-label mb-0" style={{ fontSize: '0.62rem' }}>Ordenar por</label>
                  <select id="grpOrder" className="form-select form-select-sm" value={group.orderField} disabled={counts.point === 0}
                    onChange={(e) => setGroup((g) => ({ ...g, orderField: e.target.value }))}>
                    <option value="">(orden del archivo)</option>
                    {pointKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="grpOut" className="form-label mb-0" style={{ fontSize: '0.62rem' }}>Formar</label>
                  <select id="grpOut" className="form-select form-select-sm" value={group.output} disabled={counts.point === 0}
                    onChange={(e) => setGroup((g) => ({ ...g, output: e.target.value as GroupOptions['output'] }))}>
                    <option value="polygon">Polígono</option>
                    <option value="line">Línea / trazo</option>
                  </select>
                </div>
                <button type="button" className="btn btn-sm btn-outline-dark" disabled={counts.point < 2} onClick={handleGroup}>
                  Agrupar
                </button>
              </div>
              <div className="text-muted mt-1" style={{ fontSize: '0.6rem' }}>
                Usa los puntos seleccionados (o todos si no hay ninguno marcado).
              </div>
            </div>
          </div>
        </div>

        {notice && (
          <div className="alert alert-info py-1 px-2 mb-2 d-flex justify-content-between align-items-start" style={{ fontSize: '0.7rem' }}>
            <span>{notice}</span>
            <button type="button" className="btn-close btn-sm ms-2" style={{ fontSize: '0.5rem' }} aria-label="Cerrar aviso" onClick={() => setNotice(null)}></button>
          </div>
        )}

        {/* Tabla de elementos */}
        <div className="table-responsive border rounded" style={{ maxHeight: '300px' }}>
          <table className="table table-sm table-hover mb-0 align-middle" style={{ fontSize: '0.7rem' }}>
            <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ width: '32px' }}></th>
                <th style={{ width: '40px' }}>#</th>
                <th>Tipo</th>
                <th>Nombre / atributo</th>
                <th className="text-end">Superficie / coordenadas</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => {
                const uid = getUid(f);
                const kind = geometryKind(f);
                return (
                  <tr key={uid} onClick={() => toggle(uid)} style={{ cursor: 'pointer' }}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input m-0"
                        checked={selected.has(uid)}
                        onChange={() => toggle(uid)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Graficar elemento ${i + 1}`}
                      />
                    </td>
                    <td className="text-muted">{i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <i className={`bi ${KIND_ICON[kind]} me-1`} style={{ color: kind === 'point' ? '#dc2626' : brand }}></i>
                      {geometryTypeLabel(f)}
                    </td>
                    <td>{featureDisplayName(f) || <span className="text-muted">—</span>}</td>
                    <td className="text-end" style={{ whiteSpace: 'nowrap' }}>{featureDetail(f)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="d-flex justify-content-between gap-2 p-3 border-top">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleReset}>
          <i className="bi bi-arrow-counterclockwise me-1"></i>Restaurar original
        </button>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-sm text-white fw-bold" style={{ backgroundColor: brand }} disabled={selectedCount === 0} onClick={handleApply}>
            <i className="bi bi-map me-1"></i>Graficar {selectedCount} elemento(s)
          </button>
        </div>
      </div>
    </>
  );
};

/* ------------------------------- Modal ----------------------------------- */

/**
 * Gestor de elementos del archivo subido. Se monta con `key={source.id}` para que
 * cada archivo nuevo reinicie su estado sin setState dentro de efectos.
 */
export const ElementManagerModal: React.FC<ElementManagerModalProps> = ({ source, onClose, onApply }) => {
  const [csvResult, setCsvResult] = useState<{ features: AnyFeature[]; notice: string | null } | null>(null);

  const geojsonFeatures = useMemo(
    () =>
      source.kind === 'geojson'
        ? (source.collection.features.filter((f) => Boolean(f.geometry)) as AnyFeature[]).map(withUid)
        : [],
    [source],
  );

  const showCsvStep = source.kind === 'csv' && !csvResult;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center ignore-print"
      style={{ zIndex: 2000, backgroundColor: 'rgba(15, 23, 42, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="elementManagerTitle"
    >
      <div className="bg-white rounded shadow d-flex flex-column" style={{ width: 'min(960px, 95vw)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center px-3 py-2 text-white rounded-top" style={{ backgroundColor: brand }}>
          <h6 id="elementManagerTitle" className="mb-0 fw-bold">
            <i className="bi bi-diagram-3 me-2"></i>
            {showCsvStep ? 'Importar puntos desde CSV' : 'Gestor de elementos'}
            <span className="fw-normal ms-2" style={{ fontSize: '0.75rem', opacity: 0.85 }}>{source.fileName}</span>
          </h6>
          <button type="button" className="btn-close btn-close-white" aria-label="Cerrar" onClick={onClose}></button>
        </div>

        {showCsvStep && source.kind === 'csv' ? (
          <CsvStep
            fileName={source.fileName}
            text={source.text}
            onClose={onClose}
            onConverted={(features, invalidRows) =>
              setCsvResult({
                features,
                notice:
                  invalidRows.length > 0
                    ? `Se importaron ${features.length} puntos. Filas sin coordenadas válidas: ${invalidRows.slice(0, 15).join(', ')}${invalidRows.length > 15 ? '…' : ''}.`
                    : `Se importaron ${features.length} puntos.`,
              })
            }
          />
        ) : (
          <ElementsStep
            initialFeatures={csvResult ? csvResult.features : geojsonFeatures}
            initialNotice={csvResult?.notice ?? null}
            onApply={onApply}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
};
