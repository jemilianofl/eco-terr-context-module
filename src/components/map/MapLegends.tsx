import { useMemo } from 'react';
import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type {
  SentinelMetadata,
  TypedMapFeature,
  TemporalSceneItem,
  SpectralPreset,
} from '../../hooks/useMapLayers';
import {
  ECO_LAYERS_CONFIG,
  vegSeriesOptions,
  compactarNombreVeg,
  STRAHLER_ORDER_CONFIG,
  getEcoSiteName,
} from '../../config/mapConfig';

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
        Datos del expediente
      </div>
      <div className="p-2 text-center" style={{ fontSize: '0.65rem' }}>
        <p className="mb-1">
          <strong>Acta de inspección:</strong> {previewData.acta || 'N/A'}
        </p>
        <p className="mb-0">
          <strong>Fecha de inspección:</strong> {previewData.targetDate || 'N/A'}
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
              flexShrink: 0,
            }}
          ></div>
          <span style={{ fontSize: '0.65rem', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
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

    const namesByLayerId = new Map<string, Set<string>>();

    ecoNearby.forEach((f) => {
      if (!f?.geometry || !f.properties?._layerId) return;
      let isVisible = true;
      if (viewportPolygon) {
        try {
          isVisible = turf.booleanIntersects(f, viewportPolygon);
        } catch {
          isVisible = false;
        }
      }

      if (isVisible) {
        const layerId = f.properties._layerId;
        if (!namesByLayerId.has(layerId)) {
          namesByLayerId.set(layerId, new Set<string>());
        }
        const siteName = getEcoSiteName(f.properties);
        if (siteName) {
          namesByLayerId.get(layerId)!.add(siteName);
        }
      }
    });

    return ECO_LAYERS_CONFIG.filter((layer) => namesByLayerId.has(layer.id)).map((layer) => ({
      ...layer,
      siteNames: Array.from(namesByLayerId.get(layer.id) ?? []),
    }));
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
            <span style={{ fontSize: '0.65rem', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
              Polígono(s) Inspeccionado(s)
            </span>
          </div>

          {activeEcoLegend.length > 0 ? (
            <div style={{ maxHeight: '175px', overflowY: 'auto' }}>
              {activeEcoLegend.map((layer) => (
                <div key={layer.id} className="mb-2">
                  <div className="d-flex align-items-center">
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        border: `2px ${layer.dashArray ? 'dashed' : 'solid'} ${layer.color}`,
                        backgroundColor: `${layer.color}70`,
                        marginRight: '8px',
                        flexShrink: 0,
                      }}
                    ></div>
                    <span
                      className="fw-semibold"
                      style={{ fontSize: '0.60rem', lineHeight: '1.2' }}
                    >
                      {layer.title}
                    </span>
                  </div>
                  {layer.siteNames.length > 0 && (
                    <div style={{ paddingLeft: '20px', marginTop: '2px' }}>
                      {layer.siteNames.map((siteName) => (
                        <div
                          key={`${layer.id}-${siteName}`}
                          className="text-muted"
                          style={{ fontSize: '0.56rem', lineHeight: '1.2' }}
                        >
                          - {siteName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
                    backgroundColor: `${item.color}99`,
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
                    backgroundColor: `${item.color}99`,
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
                    backgroundColor: `${item.color}99`,
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

interface LegendHidrologiaProps {
  cuencasNearby: TypedMapFeature[];
  subcuencasNearby: TypedMapFeature[];
  corrientesNearby: TypedMapFeature[];
  cuerposAguaNearby: TypedMapFeature[];
  hasMicrocuenca: boolean;
  isLoading: boolean;
  targetDate?: string;
  currentViewportBbox: [number, number, number, number] | null;
}

export const LegendHidrologia = ({
  cuencasNearby,
  subcuencasNearby,
  corrientesNearby,
  cuerposAguaNearby,
  hasMicrocuenca,
  isLoading,
  targetDate,
  currentViewportBbox,
}: LegendHidrologiaProps) => {
  const activeHydroContext = useMemo(() => {
    let viewportPolygon: Feature<Polygon> | null = null;
    if (currentViewportBbox) {
      try {
        const [minX, minY, maxX, maxY] = currentViewportBbox;
        const visibleMaxX = minX + (maxX - minX) * 0.68;
        viewportPolygon = turf.bboxPolygon([minX, minY, visibleMaxX, maxY]);
      } catch {
        viewportPolygon = null;
      }
    }

    const isInView = (f: TypedMapFeature): boolean => {
      if (!f?.geometry) return false;
      if (!viewportPolygon) return true;
      try {
        return turf.booleanIntersects(f, viewportPolygon);
      } catch {
        return false;
      }
    };

    const visibleCuencas = cuencasNearby.filter(isInView);
    const visibleSubcuencas = subcuencasNearby.filter(isInView);

    const subcuencaNames = Array.from(
      new Set(
        visibleSubcuencas
          .map((f) => (typeof f.properties?.SUBCUENCA === 'string' ? f.properties.SUBCUENCA.trim() : ''))
          .filter(Boolean)
      )
    );

    const cuencaNamesFromSubc = Array.from(
      new Set(
        visibleSubcuencas
          .map((f) => (typeof f.properties?.CUENCA === 'string' ? f.properties.CUENCA.trim() : ''))
          .filter(Boolean)
      )
    );

    const cuencaNames =
      cuencaNamesFromSubc.length > 0
        ? cuencaNamesFromSubc
        : Array.from(
            new Set(
              visibleCuencas
                .map((f) => (typeof f.properties?._type === 'string' ? f.properties._type.trim() : ''))
                .filter(Boolean)
            )
          );

    const hasVisibleWaterBodies = cuerposAguaNearby.some(isInView);
    const visibleOrders = new Set<number>();

    corrientesNearby.forEach((f) => {
      if (!isInView(f)) return;
      const ord = Number(f.properties?.ORDER_1);
      if (Number.isFinite(ord) && ord >= 1) {
        visibleOrders.add(Math.min(Math.floor(ord), 6));
      }
    });

    const displayedStrahlerItems = STRAHLER_ORDER_CONFIG.filter((item) => visibleOrders.has(item.order));

    return {
      hasCuenca: visibleCuencas.length > 0 || cuencaNames.length > 0,
      subcuencaNames,
      cuencaNames,
      hasVisibleWaterBodies,
      displayedStrahlerItems,
    };
  }, [cuencasNearby, subcuencasNearby, corrientesNearby, cuerposAguaNearby, currentViewportBbox]);

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '5px',
    minHeight: '15px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.60rem',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
  };

  const renderStrahlerList = () => {
    if (isLoading) {
      return (
        <output className="text-muted d-block text-center" style={{ fontSize: '0.60rem' }}>
          Cargando red hidrográfica...
        </output>
      );
    }

    if (activeHydroContext.displayedStrahlerItems.length === 0) {
      return (
        <output className="text-muted d-block text-center mt-2" style={{ fontSize: '0.60rem' }}>
          Sin corrientes visibles en encuadre
        </output>
      );
    }

    return (
      <div>
        {activeHydroContext.displayedStrahlerItems.map((item) => (
          <div key={`strahler-${item.order}`} style={rowStyle}>
            <div
              style={{
                width: '24px',
                height: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '2px',
                marginRight: '8px',
                padding: '0 3px',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: '100%',
                  borderTop: `${item.weight}px solid ${item.color}`,
                  display: 'block',
                }}
              />
            </div>
            <span style={labelStyle}>Orden {item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="bg-white mb-2 border border-dark">
        <div
          className="fw-bold text-white text-center mb-1"
          style={{ backgroundColor: '#0369a1', fontSize: '0.75rem' }}
        >
          Simbología Hidrológica
        </div>
        <div className="p-2">
          <p className="mb-1 text-muted" style={{ fontSize: '0.58rem' }}>
            Fuente: INEGI - SIATL / CONAGUA
          </p>

          {(activeHydroContext.cuencaNames.length > 0 ||
            activeHydroContext.subcuencaNames.length > 0) && (
            <div
              className="mb-2 p-1 rounded"
              style={{
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                fontSize: '0.58rem',
                lineHeight: '1.25',
              }}
            >
              <div>
                <strong>Cuenca:</strong> {activeHydroContext.cuencaNames.join(', ') || 'N/D'}
              </div>
              {activeHydroContext.subcuencaNames.length > 0 && (
                <div>
                  <strong>Subcuenca:</strong> {activeHydroContext.subcuencaNames.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Polígonos */}
          <div style={rowStyle}>
            <div
              style={{
                width: '14px',
                height: '12px',
                backgroundColor: 'transparent',
                border: '2px solid #ff0000',
                marginRight: '8px',
                flexShrink: 0,
              }}
            />
            <span style={labelStyle}>Polígono(s) Inspeccionado(s)</span>
          </div>

          {activeHydroContext.hasCuenca && (
            <div style={rowStyle}>
              <div
                style={{
                  width: '14px',
                  height: '12px',
                  backgroundColor: '#ede9fe99',
                  border: '2px dashed #6d28d9',
                  marginRight: '8px',
                  flexShrink: 0,
                }}
              />
              <span style={labelStyle}>Cuenca Hidrográfica</span>
            </div>
          )}

          {hasMicrocuenca && (
            <div style={rowStyle}>
              <div
                style={{
                  width: '14px',
                  height: '12px',
                  backgroundColor: '#c8b598aa',
                  border: '1.5px solid #5c4033',
                  marginRight: '8px',
                  flexShrink: 0,
                }}
              />
              <span style={labelStyle}>Microcuenca (SIATL)</span>
            </div>
          )}

          <div style={rowStyle}>
            <div
              style={{
                width: '14px',
                height: '12px',
                backgroundColor: '#d6c7a966',
                border: '1.5px dashed #78350f',
                marginRight: '8px',
                flexShrink: 0,
              }}
            />
            <span style={labelStyle}>Subcuenca 1:50,000</span>
          </div>

          {activeHydroContext.hasVisibleWaterBodies && (
            <div style={rowStyle}>
              <div
                style={{
                  width: '14px',
                  height: '12px',
                  backgroundColor: '#38bdf8a6',
                  border: '1px solid #0284c7',
                  marginRight: '8px',
                  flexShrink: 0,
                }}
              />
              <span style={labelStyle}>Cuerpos de agua</span>
            </div>
          )}

          {/* Red Hidrográfica 1:50,000 - Orden Strahler visible en encuadre */}
          <div className="border-top mt-2 pt-1">
            <div className="fw-bold text-dark" style={{ fontSize: '0.62rem' }}>
              Red Hidrográfica 1:50,000
            </div>
            <div className="text-muted mb-1" style={{ fontSize: '0.58rem' }}>
              Orden de escorrentía (Strahler):
            </div>

            {renderStrahlerList()}
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

interface LegendEspacioTemporalProps {
  targetDate?: string;
  activeScene: TemporalSceneItem | null;
  preset: SpectralPreset;
  areaDetails: { name: string; area: string }[];
  totalArea: string;
}

export const LegendEspacioTemporal = ({
  targetDate,
  activeScene,
  preset,
  areaDetails,
  totalArea,
}: LegendEspacioTemporalProps) => {
  const presetLabels: Record<SpectralPreset, string> = {
    rgb: 'Color Natural (RGB)',
    nir: 'Falso Color Infrarrojo (Vegetación)',
    swir: 'Infrarrojo de Onda Corta (SWIR)',
    ndvi: 'Índice de Vegetación (NDVI)',
  };

  const sourceLabel = activeScene?.collection?.includes('landsat')
    ? 'USGS / NASA Landsat C2 L2'
    : 'Copernicus Sentinel-2 L2A';

  const formattedHistoricalDate = activeScene?.date
    ? `${activeScene.year} (${new Date(activeScene.date).toLocaleDateString('es-MX')})`
    : 'Sin escena seleccionada';

  return (
    <>
      <div className="bg-white mb-2 border border-dark">
        <div
          className="fw-bold text-white text-center mb-1"
          style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}
        >
          Análisis Espacio-Temporal
        </div>
        <div className="p-2 text-center" style={{ fontSize: '0.62rem', lineHeight: '1.25' }}>
          <p className="mb-1">
            <strong>Escena anual:</strong> {formattedHistoricalDate}
          </p>
          <p className="mb-0">
            <strong>Fecha de inspección:</strong> {targetDate || 'N/A'}
          </p>
        </div>
      </div>

      {activeScene && (
        <div className="bg-white mb-2 border border-dark">
          <div
            className="fw-bold text-white text-center mb-1"
            style={{ backgroundColor: '#0d6efd', fontSize: '0.75rem' }}
          >
            Metadatos Satelitales
          </div>
          <div className="p-2 text-center" style={{ fontSize: '0.58rem', lineHeight: '1.25' }}>
            <p className="mb-1">
              <strong>Programa:</strong> {sourceLabel}
            </p>
            <p className="mb-1">
              <strong>Sensor:</strong> {activeScene.platform.toUpperCase()}
            </p>
            <p className="mb-1">
              <strong>Nubosidad:</strong> {activeScene.cloudCover}%
            </p>
            <p className="mb-0">
              <strong>Bandas:</strong> {presetLabels[preset]}
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
                flexShrink: 0,
              }}
            ></div>
            <span style={{ fontSize: '0.65rem', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
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
            <p key={`temp-area-${item.name}`} className="mb-1" style={{ fontSize: '0.65rem' }}>
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
};