import { useMemo } from 'react';
import * as turf from '@turf/turf';
import { ECO_LAYERS_CONFIG, vegSeriesOptions, compactarNombreVeg } from '../../config/mapConfig';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

interface PreviewData {
  acta?: string;
  targetDate?: string;
}

interface LegendUbicacionProps {
  previewData: PreviewData;
  sentinelMetadata: Record<string, unknown> | null;
  areaDetails: { name: string; area: string }[];
  totalArea: string;
  useSentinel: boolean;
}

export const LegendUbicacion = ({ previewData, sentinelMetadata, areaDetails, totalArea, useSentinel }: LegendUbicacionProps) => (
  <>
    <div className="bg-white mb-2 border border-dark">
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}>Datos de Inspección</div>
      <div className="p-2 text-center" style={{ fontSize: '0.65rem' }}>
        <p className="mb-1"><strong>Acta:</strong> {previewData.acta || 'N/A'}</p>
        <p className="mb-0"><strong>Fecha:</strong> {previewData.targetDate || 'N/A'}</p>
      </div>
    </div>
    
    {useSentinel && sentinelMetadata && (
      <div className="bg-white mb-2 border border-dark">
        <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#0d6efd', fontSize: '0.75rem' }}>Metadatos Satelitales</div>
        <div className="p-2 text-center" style={{ fontSize: '0.60rem' }}>
          <p className="mb-1"><strong>Sensor:</strong> {String(sentinelMetadata.platform)}</p>
          <p className="mb-1"><strong>Captura:</strong> {new Date(String(sentinelMetadata.date)).toLocaleDateString('es-MX')}</p>
        </div>
      </div>
    )}

    <div className="bg-white mb-2 border border-dark">
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}>Simbología</div>
      <div className="p-2">
        <div className="d-flex align-items-center mb-1">
          <div style={{ width: '12px', height: '12px', backgroundColor: 'transparent', border: '2px solid #ff0000', marginRight: '8px' }}></div>
          <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono(s) Inspeccionado(s)</span>
        </div>
      </div>
    </div>

    <div className="bg-white mb-2 border border-dark">
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem' }}>Superficie:</div>
      <div className="p-2 text-center">
        {areaDetails.map((item) => (
          <p key={`area-${item.name}`} className="mb-1" style={{ fontSize: '0.65rem' }}><strong>{item.name}:</strong> {item.area} m²</p>
        ))}
        <div style={{ borderTop: '1px solid #ccc', margin: '4px 0' }}></div>
        <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Total:</strong> {totalArea} m²</p>
      </div>
    </div>
  </>
);

interface LegendEcologicaProps {
  ecoNearby: Feature[];
  isLoading: boolean;
  targetDate?: string;
  currentViewportBbox: [number, number, number, number] | null;
}

export const LegendEcologica = ({ ecoNearby, isLoading, targetDate, currentViewportBbox }: LegendEcologicaProps) => {
  const activeEcoLegend = useMemo(() => {
    if (ecoNearby.length === 0) return [];
    
    let viewportPolygon: any = null;
    if (currentViewportBbox) {
      try {
        viewportPolygon = turf.bboxPolygon(currentViewportBbox);
      } catch {
        viewportPolygon = null;
      }
    }

    const foundIds = new Set<string>();
    
    ecoNearby.forEach((f) => {
      let isVisible = true;
      if (viewportPolygon) {
        try {
          isVisible = turf.booleanIntersects(f as any, viewportPolygon);
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
        <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}>Simbología</div>
        <div className="p-2">
          <div className="d-flex align-items-center mb-2 border-bottom pb-2">
            <div style={{ width: '12px', height: '12px', backgroundColor: 'transparent', border: '2px solid #ff0000', marginRight: '8px', flexShrink: 0 }}></div>
            <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono Inspeccionado</span>
          </div>

          {activeEcoLegend.length > 0 ? (
            activeEcoLegend.map((layer) => (
              <div key={layer.id} className="d-flex align-items-center mb-1">
                <div style={{ width: '12px', height: '12px', border: `2px solid ${layer.color}`, backgroundColor: `${layer.color}40`, marginRight: '8px' }}></div>
                <span style={{ fontSize: '0.60rem' }}>{layer.title}</span>
              </div>
            ))
          ) : (
            <output className="text-center text-muted mt-2 d-block" style={{ fontSize: '0.65rem' }}>
              {isLoading ? 'Buscando intersecciones...' : 'Sin polígonos ecológicos visibles en encuadre'}
            </output>
          )}
        </div>
      </div>
      
      <div className="border border-dark mb-2 p-1 text-center bg-white" style={{ fontSize: '0.65rem' }}>
        <span className="fw-bold">Fecha de Inspección:</span> {targetDate || 'N/A'}
      </div>
    </>
  );
};

interface LegendVegetacionProps {
  vegNearby: Feature[];
  selectedVegSerie: string;
  setSelectedVegSerie: (val: string) => void;
  currentViewportBbox: [number, number, number, number] | null;
  targetDate?: string;
}

export const LegendVegetacion = ({ vegNearby, selectedVegSerie, setSelectedVegSerie, currentViewportBbox, targetDate }: LegendVegetacionProps) => {
  const activeVegLegend = useMemo(() => {
    if (vegNearby.length === 0) return [];
    
    let viewportPolygon: Feature<Polygon> | null = null;
    if (currentViewportBbox) {
      try {
        viewportPolygon = turf.bboxPolygon(currentViewportBbox);
      } catch {
        viewportPolygon = null;
      }
    }

    const uniqueTypes = new Map<string, string>();
    
    vegNearby.forEach((f) => {
      let isVisible = true;
      if (viewportPolygon) {
        try {
          isVisible = turf.booleanIntersects(f as Feature<Polygon | MultiPolygon>, viewportPolygon);
        } catch {
          isVisible = false;
        }
      }
      
      if (isVisible && f.properties?._type) {
        uniqueTypes.set(f.properties._type, f.properties._color);
      }
    });
    
    return Array.from(uniqueTypes.entries()).map(([label, color]) => ({ label, color }));
  }, [vegNearby, currentViewportBbox]);

  return (
    <>
      <div className="bg-white mb-2 border border-dark">
        <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#65a30d', fontSize: '0.75rem' }}>Datos de Vegetación</div>
        <div className="p-2">
          <select className="form-select form-select-sm ignore-print" value={selectedVegSerie} onChange={(e) => setSelectedVegSerie(e.target.value)}>
            {vegSeriesOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
          <div className="mt-2" style={{ maxHeight: '150px', overflowY: 'auto' }}>
            
            <div className="d-flex align-items-center mb-2 border-bottom pb-2">
              <div style={{ width: '12px', height: '12px', backgroundColor: 'transparent', border: '2px solid #ff0000', marginRight: '8px', flexShrink: 0 }}></div>
              <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono Inspeccionado</span>
            </div>

            {activeVegLegend.length === 0 && !isLoading && (
              <output className="text-center text-muted mt-2 d-block" style={{ fontSize: '0.65rem' }}>
                Sin coberturas visibles en encuadre
              </output>
            )}

            {activeVegLegend.map((item) => (
              <div key={item.label} className="d-flex align-items-center mt-1">
                <div style={{ width: '12px', height: '12px', border: `2px solid ${item.color}`, backgroundColor: `${item.color}80`, marginRight: '8px', flexShrink: 0 }}></div>
                {/* Se aplica la función para compactar el nombre */}
                <span style={{ fontSize: '0.60rem' }}>{compactarNombreVeg(item.label)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-dark mb-2 p-1 text-center bg-white" style={{ fontSize: '0.65rem' }}>
        <span className="fw-bold">Fecha de Inspección:</span> {targetDate || 'N/A'}
      </div>
    </>
  );
};