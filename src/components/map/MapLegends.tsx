import React, { useMemo } from 'react';
import * as turf from '@turf/turf';
import { ECO_LAYERS_CONFIG, vegSeriesOptions } from '../../config/mapConfig';

export const LegendUbicacion = ({ previewData, sentinelMetadata, areaDetails, totalArea, useSentinel }: any) => (
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
            <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem' }}>Superficie:</div>
            <div className="p-2 text-center">
                {areaDetails.map((item: any) => (
                    <p key={`area-${item.name}`} className="mb-1" style={{ fontSize: '0.65rem' }}><strong>{item.name}:</strong> {item.area} m²</p>
                ))}
                <div style={{ borderTop: '1px solid #ccc', margin: '4px 0' }}></div>
                <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Total:</strong> {totalArea} m²</p>
            </div>
        </div>
    </>
);

export const LegendEcologica = ({ ecoNearby, isLoading, targetDate }: any) => {
    const activeEcoLegend = useMemo(() => {
        const foundIds = new Set(ecoNearby.map((f: any) => f.properties?._layerId));
        return ECO_LAYERS_CONFIG.filter((layer) => foundIds.has(layer.id));
    }, [ecoNearby]);

    return (
        <div className="bg-white mb-2 border border-dark">
            <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem' }}>Simbología</div>
            <div className="p-2">
                {activeEcoLegend.length > 0 ? (
                    activeEcoLegend.map((layer) => (
                        <div key={layer.id} className="d-flex align-items-center mb-1">
                            <div style={{ width: '12px', height: '12px', border: `2px solid ${layer.color}`, backgroundColor: `${layer.color}40`, marginRight: '8px' }}></div>
                            <span style={{ fontSize: '0.60rem' }}>{layer.title}</span>
                        </div>
                    ))
                ) : (
                    <output className="text-center text-muted mt-2 d-block" style={{ fontSize: '0.65rem' }}>
                        {isLoading ? 'Buscando intersecciones...' : 'Ningún polígono ecológico a 10 km'}
                    </output>
                )}
            </div>
        </div>
    );
};

export const LegendVegetacion = ({ vegNearby, isLoading, selectedVegSerie, setSelectedVegSerie, currentViewportBbox }: any) => {
    const activeVegLegend = useMemo(() => {
        if (vegNearby.length === 0) return [];
        let viewportPolygon = currentViewportBbox ? turf.bboxPolygon(currentViewportBbox) : null;
        const uniqueTypes = new Map<string, string>();
        vegNearby.forEach((f: any) => {
            let isVisible = viewportPolygon ? (turf.booleanIntersects(f, viewportPolygon) catch false) : true;
        if (isVisible && f.properties?._type) uniqueTypes.set(f.properties._type, f.properties._color);
    });
    return Array.from(uniqueTypes.entries()).map(([label, color]) => ({ label, color }));
}, [vegNearby, currentViewportBbox]);

return (
    <div className="bg-white mb-2 border border-dark">
        <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#65a30d', fontSize: '0.75rem' }}>Datos de Vegetación</div>
        <div className="p-2">
            <select className="form-select form-select-sm ignore-print" value={selectedVegSerie} onChange={(e) => setSelectedVegSerie(e.target.value)}>
                {vegSeriesOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
            <div className="mt-2" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {activeVegLegend.map((item) => (
                    <div key={item.label} className="d-flex align-items-center mt-1">
                        <div style={{ width: '12px', height: '12px', border: `2px solid ${item.color}`, backgroundColor: `${item.color}80`, marginRight: '8px' }}></div>
                        <span style={{ fontSize: '0.60rem' }}>{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);
};