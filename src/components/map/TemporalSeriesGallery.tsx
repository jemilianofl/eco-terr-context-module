import React, { useMemo } from 'react';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import type { SeriesBBox, SeriesYearItem } from '../../hooks/useTemporalSeries';

export interface SeriesExportProgress {
  current: number;
  total: number;
  year: number;
}

interface TemporalSeriesGalleryProps {
  items: SeriesYearItem[];
  bbox: SeriesBBox | null;
  polygon: Feature<Polygon | MultiPolygon> | null;
  activeYear: number | null;
  onPreviewYear: (year: number) => void;
  selectedYears: Set<number>;
  onToggleYear: (year: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onExportSelected: () => void;
  onExportAll: () => void;
  onCancelExport: () => void;
  onReload: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  isExporting: boolean;
  exportProgress: SeriesExportProgress | null;
  progress: { done: number; total: number };
}

/** Contorno del polígono en coordenadas de la miniatura (EPSG:4326, y invertida). */
function buildPolygonPath(polygon: Feature<Polygon | MultiPolygon> | null): string {
  if (!polygon) return '';
  const rings: Position[][] =
    polygon.geometry.type === 'Polygon'
      ? polygon.geometry.coordinates
      : polygon.geometry.coordinates.flat();
  return rings
    .map((ring) => ring.map(([lon, lat], i) => `${i === 0 ? 'M' : 'L'}${lon},${-lat}`).join(' ') + ' Z')
    .join(' ');
}

const ThumbStatus: React.FC<{ text: string; spinner?: boolean; danger?: boolean }> = ({ text, spinner, danger }) => (
  <div
    className={`w-100 h-100 d-flex flex-column align-items-center justify-content-center text-center ${danger ? 'text-danger' : 'text-muted'}`}
    style={{ fontSize: '0.62rem', backgroundColor: '#f1f5f9' }}
  >
    {spinner && <span className="spinner-border spinner-border-sm mb-1" aria-hidden="true"></span>}
    {text}
  </div>
);

export const TemporalSeriesGallery: React.FC<TemporalSeriesGalleryProps> = ({
  items,
  bbox,
  polygon,
  activeYear,
  onPreviewYear,
  selectedYears,
  onToggleYear,
  onSelectAll,
  onSelectNone,
  onExportSelected,
  onExportAll,
  onCancelExport,
  onReload,
  isPlaying,
  onTogglePlay,
  isExporting,
  exportProgress,
  progress,
}) => {
  const polygonPath = useMemo(() => buildPolygonPath(polygon), [polygon]);
  const availableCount = items.filter((it) => it.status === 'ok').length;
  const isLoading = progress.done < progress.total;
  const hasErrors = items.some((it) => it.status === 'error');

  const aspectRatio = bbox ? (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]) : 1;
  const viewBox = bbox ? `${bbox[0]} ${-bbox[3]} ${bbox[2] - bbox[0]} ${bbox[3] - bbox[1]}` : '0 0 1 1';

  return (
    <div className="bg-white border shadow-sm rounded px-3 py-2 w-100">
      {/* Encabezado + acciones */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-images" style={{ color: '#163f37' }}></i>
          <span className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>
            Serie multitemporal RGB
          </span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
            {isLoading
              ? `Consultando años… ${progress.done}/${progress.total}`
              : `${availableCount} años con escena · ${selectedYears.size} seleccionados`}
          </span>
        </div>

        <div className="d-flex flex-wrap gap-1">
          <button
            type="button"
            className={`btn btn-sm ${isPlaying ? 'btn-warning' : 'btn-outline-secondary'}`}
            onClick={onTogglePlay}
            disabled={isExporting || availableCount < 2}
            title="Recorre los años en el mapa principal para ver el avance"
          >
            <i className={`bi ${isPlaying ? 'bi-pause-fill' : 'bi-play-fill'} me-1`}></i>
            {isPlaying ? 'Pausar' : 'Reproducir'}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onSelectAll} disabled={isExporting || availableCount === 0}>
            Todos
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onSelectNone} disabled={isExporting || selectedYears.size === 0}>
            Ninguno
          </button>
          {hasErrors && !isLoading && (
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={onReload} disabled={isExporting}>
              <i className="bi bi-arrow-clockwise me-1"></i>Reintentar
            </button>
          )}
          {isExporting ? (
            <button type="button" className="btn btn-sm btn-danger fw-bold" onClick={onCancelExport}>
              <i className="bi bi-x-circle me-1"></i>Cancelar
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-sm text-white fw-bold"
                style={{ backgroundColor: '#163f37' }}
                onClick={onExportSelected}
                disabled={selectedYears.size === 0}
              >
                <i className="bi bi-download me-1"></i>Exportar seleccionados ({selectedYears.size})
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warning fw-bold"
                onClick={onExportAll}
                disabled={availableCount === 0 || isLoading}
                title={isLoading ? 'Espera a que terminen de cargarse todos los años' : undefined}
              >
                <i className="bi bi-file-earmark-zip me-1"></i>Exportar todos ({availableCount})
              </button>
            </>
          )}
        </div>
      </div>

      {exportProgress && (
        <div className="mb-2">
          <div className="d-flex justify-content-between" style={{ fontSize: '0.72rem' }}>
            <span className="fw-semibold">
              Exportando plano {exportProgress.current} de {exportProgress.total} — año {exportProgress.year}
            </span>
            <span>{Math.round(((exportProgress.current - 1) / exportProgress.total) * 100)}%</span>
          </div>
          <div className="progress" style={{ height: '6px' }}>
            <div
              className="progress-bar"
              style={{
                width: `${((exportProgress.current - 1) / exportProgress.total) * 100}%`,
                backgroundColor: '#163f37',
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Galería */}
      <div
        className="d-flex flex-wrap gap-2"
        style={{ maxHeight: '440px', overflowY: 'auto', pointerEvents: isExporting ? 'none' : 'auto', opacity: isExporting ? 0.7 : 1 }}
      >
        {items.map((it) => {
          const isActive = it.year === activeYear;
          const isSelected = selectedYears.has(it.year);
          const scene = it.scene;

          let body: React.ReactNode;
          if (it.status === 'pending' || it.status === 'loading') body = <ThumbStatus text="Buscando escena…" spinner={it.status === 'loading'} />;
          else if (it.status === 'empty') body = <ThumbStatus text="Sin escena disponible" />;
          else if (it.status === 'error') body = <ThumbStatus text={`Error (${it.error ?? 'desconocido'})`} danger />;
          else if (scene?.thumbUrl) {
            body = (
              <>
                <img
                  src={scene.thumbUrl}
                  alt={`Escena ${it.year}`}
                  loading="lazy"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
                />
                {polygonPath && (
                  <svg
                    viewBox={viewBox}
                    preserveAspectRatio="none"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                    aria-hidden="true"
                  >
                    <path d={polygonPath} fill="none" stroke="#ffffff" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
                    <path d={polygonPath} fill="none" stroke="#ff0000" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
              </>
            );
          } else body = <ThumbStatus text="Sin miniatura — clic para ver en mapa" />;

          const disabled = it.status !== 'ok';

          return (
            <div
              key={it.year}
              className="border rounded overflow-hidden"
              style={{
                width: '136px',
                borderColor: isActive ? '#d6b56a' : '#dee2e6',
                boxShadow: isActive ? '0 0 0 2px #d6b56a' : undefined,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <button
                type="button"
                className="p-0 border-0 bg-transparent w-100 d-block position-relative"
                style={{ aspectRatio: String(aspectRatio), cursor: disabled ? 'default' : 'pointer' }}
                onClick={() => !disabled && onPreviewYear(it.year)}
                disabled={disabled}
                title={disabled ? undefined : `Ver ${it.year} en el mapa`}
              >
                {body}
              </button>
              <div className="d-flex align-items-center justify-content-between px-1 py-1" style={{ backgroundColor: isActive ? '#fff8e6' : '#fff' }}>
                <div style={{ lineHeight: 1.1 }}>
                  <div className="fw-bold" style={{ fontSize: '0.75rem' }}>{it.year}</div>
                  {scene && (
                    <div className="text-muted" style={{ fontSize: '0.56rem' }}>
                      {new Date(scene.date).toLocaleDateString('es-MX')}
                      {scene.aoiClearPct !== null && scene.aoiClearPct !== undefined
                        ? ` · ${scene.aoiClearPct}% desp.`
                        : ` · ${scene.cloudCover}% nubes`}
                    </div>
                  )}
                </div>
                <input
                  type="checkbox"
                  className="form-check-input m-0"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onToggleYear(it.year)}
                  aria-label={`Incluir ${it.year} en la exportación`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
