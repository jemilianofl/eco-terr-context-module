import { useMemo } from 'react';
import * as turf from '@turf/turf';
import { ECO_LAYERS_CONFIG, vegSeriesOptions, compactarNombreVeg } from '../../config/mapConfig';
import type { Feature, Polygon } from 'geojson';
import type { SentinelMetadata, TypedMapFeature } from '../../hooks/useMapLayers';

interface PreviewData {
  acta?: string;
  targetDate?: string;
}

interface LegendUbicacionProps {
  previewData: PreviewData;
  sentinelMetadata: SentinelMetadata | null;
  areaDetails: { name: string; area: string }[];
  totalArea: string;
  useSentinel: boolean;
}

interface LegendVegetacionProps {
  vegNearby: TypedMapFeature[];
  selectedVegSerie: string;
  setSelectedVegSerie: (val: string) => void;
  currentViewportBbox: [number, number, number, number] | null;
  targetDate?: string;
  isLoading: boolean;
  isExporting?: boolean;
}

function getVisibleTypesInViewport(
  features: TypedMapFeature[],
  currentViewportBbox: [number, number, number, number] | null
): { label: string; color: string }[] {
  if (features.length === 0) return [];
  let viewportPolygon: Feature<Polygon> | null = null;
  if (currentViewportBbox) {
    try {
      viewportPolygon = turf.bboxPolygon(currentViewportBbox);
    } catch {
      viewportPolygon = null;
    }
  }
  const uniqueTypes = new Map<string, string>();
  features.forEach((f) => {
    if (!f?.geometry) return;
    let isVisible = true;
    if (viewportPolygon) {
      try {
        isVisible = turf.booleanIntersects(f, viewportPolygon);
      } catch {
        isVisible = false;
      }
    }
    if (isVisible && f.properties?._type && f.properties?._color) {
      uniqueTypes.set(f.properties._type, f.properties._color);
    }
  });
  return Array.from(uniqueTypes.entries()).map(([label, color]) => ({ label, color }));
}

export const LegendUbicacion = ({
  previewData,
  sentinelMetadata,
  areaDetails,
  totalArea,
  useSentinel,
}: LegendUbicacionProps) => (
  <>
    <div className="bg-white mb-2 border border-dark">
      <div
        className="fw-bold text-white text-center mb-1"
        style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}
      >
        Datos de Inspección
      </div>
      <div className="p-2 text-center" style={{ fontSize: '0.65rem' }}>
        <p className="mb-1">
          <strong>Acta:</strong> {previewData.acta || 'N/A'}
        </p>
        <p className="mb-0">
          <strong>Fecha:</strong> {previewData.targetDate || 'N/A'}
        </p>
      </div>
    </div>

    {useSentinel && sentinelMetadata && (
      <div className="bg-white mb-2 border border-dark">
        <div
          className="fw-bold text-white text-center mb-1"
          style={{ backgroundColor: '#0d6efd', fontSize: '0.75rem' }}
        >
          Metadatos Satelitales
        </div>
        <div className="p-2 text-center" style={{ fontSize: '0.60rem' }}>
          <p className="mb-1">
            <strong>Sensor:</strong> {sentinelMetadata.platform ?? 'N/A'}
          </p>
          <p className="mb-1">
            <strong>Captura:</strong>{' '}
            {sentinelMetadata.date
              ? new Date(sentinelMetadata.date).toLocaleDateString('es-MX')
              : 'N/A'}
          </p>
        </div>
      </div>
    )}

    <div className="bg-white mb-2 border border-dark">
      <div
        className="fw-bold text-white text-center mb-1"
        style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}
      >
        Simbología
      </div>
      <div className="p-2">
        <div className="d-flex align-items-center mb-1">
          <div
            style={{
              width: '12px',
              height: '12px',
              backgroundColor: 'transparent',
              border: '2px solid #ff0000',
              marginRight: '8px',
            }}
          ></div>
          <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>
            Polígono(s) Inspeccionado(s)
          </span>
        </div>
      </div>
    </div>

    <div className="bg-white mb-2 border border-dark">
      <div
        className="fw-bold text-white text-center mb-1"
        style={{ backgroundColor: '#163f37', fontSize: '0.75rem' }}
      >
        Superficie:
      </div>
      <div className="p-2 text-center">
        {areaDetails.map((item) => (
          <p key={`area-${item.name}`} className="mb-1" style={{ fontSize: '0.65rem' }}>
            <strong>{item.name}:</strong> {item.area} m²
          </p>
        ))}
        <div style={{ borderTop: '1px solid #ccc', margin: '4px 0' }}></div>
        <p className="mb-0" style={{ fontSize: '0.7rem' }}>
          <strong>Total:</strong> {totalArea} m²
        </p>
      </div>
    </div>
  </>
);

interface LegendEcologicaProps {
  ecoNearby: TypedMapFeature[];
  isLoading: boolean;
  targetDate?: string;
  currentViewportBbox: [number, number, number, number] | null;
}

export const LegendEcologica = ({
  ecoNearby,
  isLoading,
  targetDate,
  currentViewportBbox,
}: LegendEcologicaProps) => {
  const activeEcoLegend = useMemo(() => {
    if (ecoNearby.length === 0) return [];

    let viewportPolygon: Feature<Polygon> | null = null;
    if (currentViewportBbox) {
      try {
        viewportPolygon = turf.bboxPolygon(currentViewportBbox);
      } catch {
        viewportPolygon = null;
      }
    }

    const foundIds = new Set<string>();

    ecoNearby.forEach((f) => {
      if (!f?.geometry) return;
      let isVisible = true;
      if (viewportPolygon) {
        try {
          isVisible = turf.booleanIntersects(f, viewportPolygon);
        } catch {
          isVisible = false;
        }
      }

      if (isVisible && f.properties?._layerId) {
        foundIds.add(f.properties._layerId);
      }
    });

    return ECO_LAYERS_CONFIG.filter((layer) => foundIds.has(layer.id));
  }, [ecoNearby, currentViewportBbox]);

  return (
    <>
      <div className="bg-white mb-2 border border-dark">
        <div
          className="fw-bold text-white text-center mb-1"
          style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}
        >
          Simbología
        </div>
        <div className="p-2">
          <p className="mb-2 text-muted" style={{ fontSize: '0.60rem' }}>
            Capa extraída de: CONABIO/CONANP
          </p>
          <div className="d-flex align-items-center mb-2 border-bottom pb-2">
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: 'transparent',
                border: '2px solid #ff0000',
                marginRight: '8px',
                flexShrink: 0,
              }}
            ></div>
            <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono Inspeccionado</span>
          </div>

          {activeEcoLegend.length > 0 ? (
            activeEcoLegend.map((layer) => (
              <div key={layer.id} className="d-flex align-items-center mb-1">
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${layer.color}`,
                    backgroundColor: `${layer.color}40`,
                    marginRight: '8px',
                  }}
                ></div>
                <span style={{ fontSize: '0.60rem' }}>{layer.title}</span>
              </div>
            ))
          ) : (
            <output
              className="text-center text-muted mt-2 d-block"
              style={{ fontSize: '0.65rem' }}
            >
              {isLoading
                ? 'Buscando intersecciones...'
                : 'Sin polígonos ecológicos visibles en encuadre'}
            </output>
          )}
        </div>
      </div>

      <div
        className="border border-dark mb-2 p-1 text-center bg-white"
        style={{ fontSize: '0.65rem' }}
      >
        <span className="fw-bold">Fecha de Inspección:</span> {targetDate || 'N/A'}
      </div>
    </>
  );
};

export const LegendVegetacion = ({
  vegNearby,
  selectedVegSerie,
  setSelectedVegSerie,
  currentViewportBbox,
  targetDate,
  isLoading,
  isExporting = false,
}: LegendVegetacionProps) => {
  const activeVegLegend = useMemo(
    () => getVisibleTypesInViewport(vegNearby, currentViewportBbox),
    [vegNearby, currentViewportBbox]
  );

  const activeSerieLabel = useMemo(() => {
    const serieLabels: Record<string, string> = {
      serie_1: 'Serie I (1997)',
      serie_2: 'Serie II (2001)',
      serie_3: 'Serie III (2005)',
      serie_4: 'Serie IV (2009)',
      serie_5: 'Serie V (2013)',
      serie_6: 'Serie VI (2016)',
      serie_7: 'Serie VII (2021)',
    };

    if (serieLabels[selectedVegSerie]) {
      return serieLabels[selectedVegSerie];
    }

    if (vegSeriesOptions && Array.isArray(vegSeriesOptions)) {
      const option = vegSeriesOptions.find((opt) => opt.id === selectedVegSerie);
      if (option) {
        return option.label;
      }
    }

    return selectedVegSerie;
  }, [selectedVegSerie]);

  return (
    <>
      <div className="bg-white mb-2 border border-dark">
        <div
          className="fw-bold text-white text-center mb-1"
          style={{ backgroundColor: '#65a30d', fontSize: '0.75rem' }}
        >
          Datos de Vegetación
        </div>
        <div className="p-2">
          <span
            className="fw-bold mb-1 d-block text-muted"
            style={{ fontSize: '0.60rem' }}
          >
            Capa extraída de: INEGI
          </span>

          {isExporting ? (
            <div
              className="fw-bold text-dark text-center border-bottom pb-2 mb-2"
              style={{ fontSize: '0.65rem' }}
            >
              {activeSerieLabel}
            </div>
          ) : (
            <select
              aria-label="Seleccionar serie de vegetación INEGI"
              className="form-select form-select-sm ignore-print mb-2"
              value={selectedVegSerie}
              onChange={(e) => setSelectedVegSerie(e.target.value)}
            >
              {vegSeriesOptions?.map((opt) => (
                <option key={`veg-opt-${opt.id}`} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          <div className="mt-2" style={{ maxHeight: '150px', overflowY: 'auto' }}>
            <div className="d-flex align-items-center mb-1">
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: 'transparent',
                  border: '2px solid #ff0000',
                  marginRight: '8px',
                  flexShrink: 0,
                }}
              ></div>
              <span style={{ fontSize: '0.65rem', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
                Polígono(s) Inspeccionado(s)
              </span>
            </div>

            {activeVegLegend.length === 0 && !isLoading && (
              <output
                className="text-center text-muted mt-2 d-block"
                style={{ fontSize: '0.65rem' }}
              >
                Sin coberturas visibles en encuadre
              </output>
            )}

            {activeVegLegend.map((item) => (
              <div key={item.label} className="d-flex align-items-center mt-1">
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${item.color}`,
                    backgroundColor: `${item.color}80`,
                    marginRight: '8px',
                    flexShrink: 0,
                  }}
                ></div>
                <span style={{ fontSize: '0.60rem' }}>{compactarNombreVeg(item.label)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="border border-dark mb-2 p-1 text-center bg-white"
        style={{ fontSize: '0.65rem' }}
      >
        <span className="fw-bold">Fecha de Inspección:</span> {targetDate || 'N/A'}
      </div>
    </>
  );
};

interface LegendClimaProps {
  climateNearby: TypedMapFeature[];
  isLoading: boolean;
  targetDate?: string;
  currentViewportBbox: [number, number, number, number] | null;
}

export const LegendClima = ({
  climateNearby,
  isLoading,
  targetDate,
  currentViewportBbox,
}: LegendClimaProps) => {
  const activeClimateLegend = useMemo(
    () => getVisibleTypesInViewport(climateNearby, currentViewportBbox),
    [climateNearby, currentViewportBbox]
  );

  return (
    <>
      <div className="bg-white mb-2 border border-dark">
        <div
          className="fw-bold text-white text-center mb-1"
          style={{ backgroundColor: '#0284c7', fontSize: '0.75rem' }}
        >
          Unidades Climáticas
        </div>
        <div className="p-2">
          <p className="mb-2 text-muted" style={{ fontSize: '0.60rem' }}>
            Capa extraída de: CONABIO (García - 1998)
          </p>

          <div className="mt-2" style={{ maxHeight: '165px', overflowY: 'auto' }}>
            <div className="d-flex align-items-center mb-1">
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: 'transparent',
                  border: '2px solid #ff0000',
                  marginRight: '8px',
                  flexShrink: 0,
                }}
              ></div>
              <span style={{ fontSize: '0.65rem', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
                Polígono(s) Inspeccionado(s)
              </span>
            </div>

            {activeClimateLegend.length === 0 && !isLoading && (
              <output
                className="text-center text-muted mt-2 d-block"
                style={{ fontSize: '0.65rem' }}
              >
                Sin unidades climáticas visibles en encuadre
              </output>
            )}

            {activeClimateLegend.map((item) => (
              <div key={item.label} className="d-flex align-items-center mt-1">
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${item.color}`,
                    backgroundColor: `${item.color}80`,
                    marginRight: '8px',
                    flexShrink: 0,
                  }}
                ></div>
                <span style={{ fontSize: '0.60rem' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="border border-dark mb-2 p-1 text-center bg-white"
        style={{ fontSize: '0.65rem' }}
      >
        <span className="fw-bold">Fecha de Inspección:</span> {targetDate || 'N/A'}
      </div>
    </>
  );
};

interface LegendEdafologiaProps {
  edafologiaNearby: TypedMapFeature[];
  isLoading: boolean;
  targetDate?: string;
  currentViewportBbox: [number, number, number, number] | null;
}

export const LegendEdafologia = ({
  edafologiaNearby,
  isLoading,
  targetDate,
  currentViewportBbox,
}: LegendEdafologiaProps) => {
  const activeEdafologiaLegend = useMemo(
    () => getVisibleTypesInViewport(edafologiaNearby, currentViewportBbox),
    [edafologiaNearby, currentViewportBbox]
  );

  return (
    <>
      <div className="bg-white mb-2 border border-dark">
        <div
          className="fw-bold text-white text-center mb-1"
          style={{ backgroundColor: '#92400e', fontSize: '0.75rem' }}
        >
          Edafología (Serie II)
        </div>
        <div className="p-2">
          <p className="mb-2 text-muted" style={{ fontSize: '0.60rem' }}>
            Capa extraída de: INEGI (Esc. 1:250,000)
          </p>

          <div className="mt-2" style={{ maxHeight: '165px', overflowY: 'auto' }}>
            <div className="d-flex align-items-center mb-1">
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: 'transparent',
                  border: '2px solid #ff0000',
                  marginRight: '8px',
                  flexShrink: 0,
                }}
              ></div>
              <span style={{ fontSize: '0.65rem', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
                Polígono(s) Inspeccionado(s)
              </span>
            </div>

            {activeEdafologiaLegend.length === 0 && !isLoading && (
              <output
                className="text-center text-muted mt-2 d-block"
                style={{ fontSize: '0.65rem' }}
              >
                Sin unidades edafológicas visibles en encuadre
              </output>
            )}

            {activeEdafologiaLegend.map((item) => (
              <div key={item.label} className="d-flex align-items-center mt-1">
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${item.color}`,
                    backgroundColor: `${item.color}80`,
                    marginRight: '8px',
                    flexShrink: 0,
                  }}
                ></div>
                <span style={{ fontSize: '0.60rem' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="border border-dark mb-2 p-1 text-center bg-white"
        style={{ fontSize: '0.65rem' }}
      >
        <span className="fw-bold">Fecha de Inspección:</span> {targetDate || 'N/A'}
      </div>
    </>
  );
};