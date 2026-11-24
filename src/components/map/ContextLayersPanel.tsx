import React, { useMemo, useState } from 'react';
import {
  CONTEXT_LAYER_GROUPS,
  ECO_LAYERS_CONFIG,
  INTEGRIDAD_RASTER,
  type ContextLayerGroup,
} from '../../config/mapConfig';

const brand = '#163f37';

interface ContextLayerRow {
  id: string;
  title: string;
  color: string;
  dashArray?: string;
  group: ContextLayerGroup;
  kind: 'vector' | 'raster';
}

const ALL_CONTEXT_LAYERS: ContextLayerRow[] = [
  ...ECO_LAYERS_CONFIG.map((l) => ({
    id: l.id,
    title: l.title,
    color: l.color,
    dashArray: l.dashArray,
    group: l.group,
    kind: 'vector' as const,
  })),
  {
    id: INTEGRIDAD_RASTER.id,
    title: INTEGRIDAD_RASTER.title,
    color: '#84cc16',
    group: INTEGRIDAD_RASTER.group,
    kind: 'raster',
  },
];

interface ContextLayersPanelProps {
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Elementos encontrados por capa en el área de consulta (intersección o buffer). */
  counts: Map<string, number>;
  isLoading: boolean;
  /** Estado del raster: cargando / error. */
  rasterStatus?: { isLoading: boolean; error: string | null };
}

const Swatch: React.FC<{ row: ContextLayerRow }> = ({ row }) =>
  row.kind === 'raster' ? (
    <span
      style={{
        width: '14px',
        height: '12px',
        flexShrink: 0,
        background: 'linear-gradient(90deg, #b91c1c, #facc15, #15803d)',
        border: '1px solid #64748b',
      }}
    />
  ) : (
    <span
      style={{
        width: '14px',
        height: '12px',
        flexShrink: 0,
        border: `2px ${row.dashArray ? 'dashed' : 'solid'} ${row.color}`,
        backgroundColor: `${row.color}55`,
      }}
    />
  );

/** Botón "Capas de contexto" con la lista de capas para prender / apagar (no sale en la exportación). */
export const ContextLayersPanel: React.FC<ContextLayersPanelProps> = ({
  visible,
  onChange,
  counts,
  isLoading,
  rasterStatus,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const total = ALL_CONTEXT_LAYERS.length;
  const activeCount = ALL_CONTEXT_LAYERS.filter((l) => visible.has(l.id)).length;

  const grouped = useMemo(
    () =>
      CONTEXT_LAYER_GROUPS.map((group) => ({
        group,
        rows: ALL_CONTEXT_LAYERS.filter((l) => l.group === group),
      })).filter((g) => g.rows.length > 0),
    [],
  );

  const toggle = (id: string) => {
    const next = new Set(visible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(visible);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  const statusText = (row: ContextLayerRow): { text: string; muted: boolean } => {
    if (row.kind === 'raster') {
      if (!visible.has(row.id)) return { text: 'Cobertura nacional', muted: true };
      if (rasterStatus?.error) return { text: 'Error al cargar', muted: false };
      if (rasterStatus?.isLoading) return { text: 'Cargando…', muted: true };
      return { text: 'Cobertura nacional', muted: true };
    }
    if (isLoading) return { text: 'Consultando…', muted: true };
    const n = counts.get(row.id) ?? 0;
    return n > 0 ? { text: `${n} en el área`, muted: false } : { text: 'Sin elementos', muted: true };
  };

  return (
    <div className="bg-white border shadow-sm rounded px-3 py-2 w-100">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <button
          type="button"
          className={`btn btn-sm fw-bold ${isOpen ? 'text-white' : 'btn-outline-secondary'}`}
          style={isOpen ? { backgroundColor: brand, borderColor: brand } : undefined}
          onClick={() => setIsOpen((o) => !o)}
          aria-expanded={isOpen}
          aria-controls="contextLayersList"
        >
          <i className="bi bi-stack me-1"></i>
          Capas de contexto ({activeCount}/{total})
          <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'} ms-1`}></i>
        </button>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
          Elige qué capas se dibujan en el mapa y aparecen en la simbología.
        </span>
      </div>

      {isOpen && (
        <div id="contextLayersList" className="mt-2">
          <div className="d-flex gap-1 mb-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary py-0"
              onClick={() => setMany(ALL_CONTEXT_LAYERS.map((l) => l.id), true)}
            >
              Todas
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary py-0"
              onClick={() => setMany(ALL_CONTEXT_LAYERS.map((l) => l.id), false)}
            >
              Ninguna
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary py-0"
              title="Prende solo las capas con elementos en el área de consulta"
              disabled={isLoading}
              onClick={() =>
                onChange(
                  new Set(
                    ALL_CONTEXT_LAYERS.filter(
                      (l) => (l.kind === 'vector' && (counts.get(l.id) ?? 0) > 0) || (l.kind === 'raster' && visible.has(l.id)),
                    ).map((l) => l.id),
                  ),
                )
              }
            >
              Solo con elementos
            </button>
          </div>

          <div className="row g-2">
            {grouped.map(({ group, rows }) => {
              const ids = rows.map((r) => r.id);
              const allOn = ids.every((id) => visible.has(id));
              return (
                <div key={group} className="col-md-6">
                  <div className="border rounded p-2 h-100">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-bold" style={{ fontSize: '0.72rem', color: brand }}>
                        {group}
                      </span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-decoration-none"
                          style={{ fontSize: '0.65rem' }}
                          onClick={() => setMany(ids, !allOn)}
                        >
                          {allOn ? 'Apagar grupo' : 'Prender grupo'}
                        </button>
                      )}
                    </div>
                    {rows.map((row) => {
                      const status = statusText(row);
                      const inputId = `ctx-layer-${row.id}`;
                      return (
                        <div key={row.id} className="form-check d-flex align-items-center gap-2 mb-1 ps-0">
                          <input
                            id={inputId}
                            type="checkbox"
                            className="form-check-input m-0 flex-shrink-0"
                            checked={visible.has(row.id)}
                            onChange={() => toggle(row.id)}
                          />
                          <Swatch row={row} />
                          <label htmlFor={inputId} className="form-check-label flex-grow-1" style={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                            {row.title}
                          </label>
                          <span
                            className={`badge border ${status.muted ? 'text-bg-light text-muted' : 'text-bg-light'}`}
                            style={{ fontSize: '0.6rem', whiteSpace: 'nowrap' }}
                          >
                            {status.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
