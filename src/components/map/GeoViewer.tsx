import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ScaleControl, CircleMarker, useMapEvents, Polyline } from 'react-leaflet';
import { useForm } from 'react-hook-form';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type { FeatureCollection, Feature, Geometry, GeoJsonObject, GeoJsonProperties } from 'geojson';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import * as turf from '@turf/turf';
import profepaLogo from '../../assets/img/LOGO_PROFEPA.png';

// Desactivar aceleración 3D globalmente en Leaflet para evitar el desfase de polígonos en html2canvas
L.Browser.any3d = false;

interface FormData {
    targetDate: string;
    polygonFile: FileList;
    expediente: string;
    acta: string;
    estado: string;
    municipio: string;
    vegetacion: string;
}

interface FrameData {
    w: number;
    h: number;
    xTicks: { lon: number, x: number }[];
    yTicks: { lat: number, y: number }[];
}

const toDMS = (deg: number, isLat: boolean) => {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.floor((minutesFloat - minutes) * 60);
    const direction = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${degrees}°${minutes}'${seconds}"${direction}`;
};

const cleanName = (name: string) => name.replace(/\s*\([^)]*\)\s*/g, '').trim();

const featureStyle = (feature?: Feature<Geometry, GeoJsonProperties>) => {
    if (!feature) return {};
    return { color: '#ff0000', weight: 2.5, fillColor: '#ff0000', fillOpacity: 0 };
};

const pointToLayer = (_feature: Feature<Geometry, GeoJsonProperties>, latlng: L.LatLng) => {
    return L.circleMarker(latlng, { radius: 4, fillColor: "#ff0000", color: "#ffffff", weight: 1, opacity: 1, fillOpacity: 0.8 });
};

const onEachFeature = (feature: Feature<Geometry, GeoJsonProperties>, layer: L.Layer) => {
    if (feature.properties && feature.geometry.type !== 'Point') {
        const polyId = feature.properties.polyId || '';

        let areaHtml = "";
        try {
            const areaSqMeters = turf.area(feature);
            areaHtml = `<br/><strong>Superficie:</strong> ${areaSqMeters.toFixed(2)} m²`;
        } catch (e) {
            console.warn("No se pudo calcular el área:", e);
        }

        layer.bindPopup(`<strong>Polígono ${polyId}</strong>${areaHtml}`);

        if (polyId) {
            // Se eliminó el fondo blanco y se aplicó text-shadow para que resalte la letra
            layer.bindTooltip(
                `<div style="font-size:1.1rem; font-weight:900; color:#ff0000; text-shadow: -1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff;">${polyId}</div>`,
                {
                    permanent: true,
                    direction: 'center',
                    className: 'bg-transparent border-0 shadow-none',
                    opacity: 1
                }
            );
        }
    }
};

const GraticuleEngine: React.FC = () => {
    const map = useMap();
    const [grid, setGrid] = useState<{ lats: number[], lons: number[], bounds: L.LatLngBounds | null }>({ lats: [], lons: [], bounds: null });

    const updateGrid = useCallback(() => {
        if (!map || !map.getContainer()) return;
        const b = map.getBounds();
        const mapSize = map.getSize();
        const mapWidthDegrees = b.getEast() - b.getWest();
        const mapHeightDegrees = b.getNorth() - b.getSouth();

        const stepX = mapWidthDegrees / 3;
        const stepY = mapHeightDegrees / 3;

        const lats: number[] = [];
        for (let lat = b.getSouth() + stepY / 2; lat < b.getNorth(); lat += stepY) lats.push(lat);

        const lons: number[] = [];
        for (let lon = b.getWest() + stepX / 2; lon < b.getEast(); lon += stepX) lons.push(lon);

        setGrid({ lats, lons, bounds: b });

        const xTicks = lons.map(lon => ({ lon, x: map.latLngToContainerPoint([b.getSouth(), lon]).x }));
        const yTicks = lats.map(lat => ({ lat, y: map.latLngToContainerPoint([lat, b.getWest()]).y }));

        document.dispatchEvent(new CustomEvent('mapFrameUpdated', { detail: { w: mapSize.x, h: mapSize.y, xTicks, yTicks } }));
    }, [map]);

    useMapEvents({ moveend: updateGrid, zoomend: updateGrid, resize: updateGrid });

    useEffect(() => {
        updateGrid();
        return () => setGrid({ lats: [], lons: [], bounds: null });
    }, [updateGrid]);

    if (!grid.bounds) return null;

    return (
        <>
            {grid.lats.map((lat, i) => (
                <Polyline key={`lat-${i}-${lat}`} positions={[[lat, grid.bounds!.getWest()], [lat, grid.bounds!.getEast()]]} pathOptions={{ color: 'white', weight: 1.5, opacity: 0.5, dashArray: '5,5' }} />
            ))}
            {grid.lons.map((lon, i) => (
                <Polyline key={`lon-${i}-${lon}`} positions={[[grid.bounds!.getSouth(), lon], [grid.bounds!.getNorth(), lon]]} pathOptions={{ color: 'white', weight: 1.5, opacity: 0.5, dashArray: '5,5' }} />
            ))}
        </>
    );
};

// Se actualizó para manejar el Zoom según el Plano seleccionado
const MapUpdater: React.FC<{ data: FeatureCollection | null, plano: number }> = ({ data, plano }) => {
    const map = useMap();
    useEffect(() => {
        if (data && data.features.length > 0) {
            const layer = L.geoJSON(data as GeoJsonObject);
            const bounds = layer.getBounds();
            if (bounds.isValid()) {
                const paddingOpts = { paddingBottomRight: [330, 30] as [number, number], paddingTopLeft: [40, 40] as [number, number] };

                if (plano === 1) {
                    // Plano 1: Ubicación Geográfica (Zoom Out)
                    map.fitBounds(bounds, { ...paddingOpts, maxZoom: 12 });
                } else if (plano === 2) {
                    // Plano 2: Detalle Vértices (Zoom In)
                    map.fitBounds(bounds, { ...paddingOpts, maxZoom: 18 });
                } else {
                    // General
                    map.fitBounds(bounds, paddingOpts);
                }
            }
        }
    }, [data, map, plano]);
    return null;
};

const InvalidateMap: React.FC = () => {
    const map = useMap();
    useEffect(() => {
        const timer = setTimeout(() => { map.invalidateSize(); }, 400);
        return () => clearTimeout(timer);
    }, [map]);
    return null;
};

// Se cambió a OpenStreetMap puro con CORS anónimo y preferCanvas={true} para que se exporte correctamente
const MiniMapLocator: React.FC<{ data: FeatureCollection | null, estado: string, municipio: string }> = ({ data, estado, municipio }) => {
    if (!data || data.features.length === 0) return null;
    const center = L.geoJSON(data as GeoJsonObject).getBounds().getCenter();

    return (
        <div className="bg-white p-1 mb-2 border border-dark" style={{ overflow: 'hidden' }}>
            <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Localización geográfica</div>
            <div style={{ height: '110px', width: '100%', position: 'relative', border: '1px solid #444' }}>
                {/* Zoom a 6 para mostrar aproximadamente 2 estados */}
                <MapContainer center={center} zoom={6} zoomControl={false} dragging={false} scrollWheelZoom={false} preferCanvas={true} style={{ height: '100%', width: '100%' }}>
                    <InvalidateMap />
                    <TileLayer crossOrigin="anonymous" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <CircleMarker center={center} radius={4} color="black" weight={1} fillColor="red" fillOpacity={1} />
                </MapContainer>
            </div>
            <div className="text-center mt-1" style={{ fontSize: '0.65rem', lineHeight: '1.1' }}>
                Estado: {estado || 'N/A'}<br />Municipio: {municipio || 'N/A'}
            </div>
        </div>
    );
};

export const GeoViewer: React.FC = () => {
    const { register, handleSubmit } = useForm<FormData>();
    const [mapCenter] = useState<[number, number]>([19.4326, -99.1332]);
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [previewData, setPreviewData] = useState<FormData | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // 0: General, 1: Ubicación Geográfica, 2: Detalles
    const [currentPlano, setCurrentPlano] = useState<number>(0);
    const [isExporting, setIsExporting] = useState<boolean>(false);

    const [frameData, setFrameData] = useState<FrameData | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: Event) => setFrameData((e as CustomEvent<FrameData>).detail);
        document.addEventListener('mapFrameUpdated', handler);
        return () => document.removeEventListener('mapFrameUpdated', handler);
    }, []);

    const onSubmit = async (data: FormData) => {
        const files = data.polygonFile;
        if (!files || files.length === 0) return;
        setPreviewData(data);

        try {
            let parsedData: unknown = null;
            const zipFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.zip'));
            const kmlFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.kml'));
            const geoJsonFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.geojson'));

            if (zipFile) {
                parsedData = await shp(await zipFile.arrayBuffer());
                if (Array.isArray(parsedData)) parsedData = parsedData[0];
            } else if (kmlFile) {
                parsedData = kml(new DOMParser().parseFromString(await kmlFile.text(), 'text/xml'));
            } else if (geoJsonFile) {
                parsedData = JSON.parse(await geoJsonFile.text());
            }

            if ((parsedData as GeoJsonObject)?.type !== 'FeatureCollection') {
                parsedData = { type: 'FeatureCollection', features: [parsedData] };
            }

            let polyIndex = 0;
            (parsedData as FeatureCollection).features.forEach(f => {
                if (f.geometry.type !== 'Point') {
                    f.properties = f.properties || {};
                    f.properties.polyId = String.fromCharCode(65 + polyIndex);
                    polyIndex++;
                }
            });

            setGeoJsonData(parsedData as FeatureCollection);
            setIsSidebarOpen(false);
        } catch (err) {
            console.warn("Error procesando el archivo espacial:", err);
            alert("Error procesando el archivo espacial.");
        }
    };

    const handleDownloadImage = () => {
        if (!printRef.current) return;
        setIsExporting(true);
        window.scrollTo(0, 0);

        setTimeout(async () => {
            try {
                const canvas = await html2canvas(printRef.current!, {
                    useCORS: true,
                    allowTaint: true,
                    scale: 2,
                    scrollY: 0,
                    backgroundColor: '#ffffff',
                    ignoreElements: (el) => el.classList.contains('ignore-print') || el.classList.contains('leaflet-popup')
                });
                const link = document.createElement('a');

                let planoName = "General";
                if (currentPlano === 1) planoName = "Ubicacion";
                if (currentPlano === 2) planoName = "Detalle";

                link.download = `Mapa_Oficial_${previewData?.expediente || 'Dictamen'}_${planoName}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
            } catch (err) {
                console.warn("Error al generar imagen:", err);
                alert("Error al generar la imagen.");
            } finally {
                setIsExporting(false);
            }
        }, 300);
    };

    const getSimbologiaAndArea = () => {
        if (!geoJsonData) return { totalArea: 0, areaDetails: [] };
        let totalArea = 0;
        const areaDetails: { name: string, area: string }[] = [];

        geoJsonData.features.forEach(f => {
            if (f.geometry.type === 'Point') return;
            const polyId = f.properties?.polyId;

            try {
                const areaSqMeters = turf.area(f);
                totalArea += areaSqMeters;
                if (polyId) {
                    areaDetails.push({ name: `Polígono ${polyId}`, area: areaSqMeters.toFixed(2) });
                }
            } catch (err) {
                console.warn("Turf Error:", err);
            }
        });

        return {
            totalArea: totalArea.toFixed(2),
            areaDetails
        };
    };

    const { totalArea, areaDetails } = getSimbologiaAndArea();

    const renderZebraFrame = () => {
        if (!frameData) return null;
        const { w, h, xTicks, yTicks } = frameData;
        const borderWeight = 8;

        const xEdges = [0, ...xTicks.map(t => t.x).filter(x => x > 0 && x < w).sort((a, b) => a - b), w];
        const yEdges = [0, ...yTicks.map(t => t.y).filter(y => y > 0 && y < h).sort((a, b) => a - b), h];

        const segments: React.ReactNode[] = [];

        for (let i = 0; i < xEdges.length - 1; i++) {
            const left = xEdges[i];
            const width = xEdges[i + 1] - left;
            const isBlack = i % 2 === 0;
            segments.push(
                <div key={`tx-${i}-${left}`} style={{ position: 'absolute', top: 0, left, width, height: borderWeight, backgroundColor: isBlack ? '#000' : '#fff', zIndex: 1000 }} />,
                <div key={`bx-${i}-${left}`} style={{ position: 'absolute', bottom: 0, left, width, height: borderWeight, backgroundColor: isBlack ? '#fff' : '#000', zIndex: 1000 }} />
            );
        }
        for (let i = 0; i < yEdges.length - 1; i++) {
            const top = yEdges[i];
            const height = yEdges[i + 1] - top;
            const isBlack = i % 2 === 0;
            segments.push(
                <div key={`ly-${i}-${top}`} style={{ position: 'absolute', left: 0, top, width: borderWeight, height, backgroundColor: isBlack ? '#fff' : '#000', zIndex: 1000 }} />,
                <div key={`ry-${i}-${top}`} style={{ position: 'absolute', right: 0, top, width: borderWeight, height, backgroundColor: isBlack ? '#000' : '#fff', zIndex: 1000 }} />
            );
        }
        return segments;
    };

    const renderLabels = () => {
        if (!frameData) return null;
        const { w, h, xTicks, yTicks } = frameData;

        const labelStyle: React.CSSProperties = {
            position: 'absolute', fontSize: '0.65rem', fontWeight: 'bold', color: 'black',
            whiteSpace: 'nowrap', zIndex: 10, textAlign: 'center'
        };

        const elements: React.ReactNode[] = [];

        xTicks.forEach((tick) => {
            if (tick.x > 0 && tick.x < w) {
                elements.push(
                    <div key={`b-${tick.lon}-${tick.x}`} style={{ ...labelStyle, left: tick.x, bottom: '-20px', transform: 'translateX(-50%)' }}>{toDMS(tick.lon, false)}</div>,
                    <div key={`t-${tick.lon}-${tick.x}`} style={{ ...labelStyle, left: tick.x, top: '-20px', transform: 'translateX(-50%)' }}>{toDMS(tick.lon, false)}</div>
                );
            }
        });

        yTicks.forEach((tick) => {
            if (tick.y > 0 && tick.y < h) {
                elements.push(
                    <div key={`l-${tick.lat}-${tick.y}`} style={{ ...labelStyle, left: '-4px', top: tick.y, transform: 'translate(-100%, -50%) rotate(-90deg)' }}>{toDMS(tick.lat, true)}</div>,
                    <div key={`r-${tick.lat}-${tick.y}`} style={{ ...labelStyle, right: '-4px', top: tick.y, transform: 'translate(100%, -50%) rotate(90deg)' }}>{toDMS(tick.lat, true)}</div>
                );
            }
        });
        return elements;
    };

    return (
        <div className="container-fluid p-0 m-0 d-flex flex-column position-relative bg-light-gray" style={{ minHeight: '100vh', height: '100vh' }}>

            <div className="d-flex flex-grow-1 position-relative overflow-hidden" style={{ height: '100%' }}>

                {/* PANEL IZQUIERDO */}
                <div className={`bg-white border-end shadow-sm overflow-auto transition-all ${isSidebarOpen ? 'd-block' : 'd-none'}`} style={{ zIndex: 1050, width: '320px', position: 'absolute', height: '100%', left: 0 }}>
                    <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
                        <h5 className="fw-bold mb-0" style={{ color: '#163f37' }}>Datos del Dictamen</h5>
                        <button type="button" className="btn-close" onClick={() => setIsSidebarOpen(false)} aria-label="Close"></button>
                    </div>
                    <div className="p-3">
                        <form onSubmit={handleSubmit(onSubmit)} className="d-flex flex-column gap-3">
                            <div><label htmlFor="expId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Expediente</label><input id="expId" type="text" className="form-control form-control-sm" {...register('expediente', { required: true })} /></div>
                            <div><label htmlFor="actId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Acta de Inspección</label><input id="actId" type="text" className="form-control form-control-sm" {...register('acta')} /></div>
                            <div className="row">
                                <div className="col-6"><label htmlFor="estId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Estado</label><input id="estId" type="text" className="form-control form-control-sm" {...register('estado')} /></div>
                                <div className="col-6"><label htmlFor="munId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Municipio</label><input id="munId" type="text" className="form-control form-control-sm" {...register('municipio')} /></div>
                            </div>
                            <div><label htmlFor="vegId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Tipo de Vegetación</label><input id="vegId" type="text" className="form-control form-control-sm" {...register('vegetacion')} /></div>
                            <div><label htmlFor="datId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Fecha (Elaboración)</label><input id="datId" type="date" className="form-control form-control-sm" {...register('targetDate', { required: true })} /></div>
                            <div><label htmlFor="fileId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Cargar Archivos Espaciales</label><input id="fileId" type="file" accept=".geojson,.kml,.zip" className="form-control form-control-sm" {...register('polygonFile', { required: true })} /></div>
                            <button type="submit" className="btn text-white fw-bold mt-2" style={{ backgroundColor: '#163f37' }}>Generar Previsualización</button>
                        </form>
                    </div>
                </div>

                {/* ÁREA CENTRAL */}
                <div className="flex-grow-1 position-relative p-0" style={{ backgroundColor: '#e9ecef', height: '100%' }}>

                    {!isSidebarOpen && (
                        <button onClick={() => setIsSidebarOpen(true)} className="btn text-white position-absolute shadow ignore-print" style={{ top: '15px', left: '15px', zIndex: 1040, backgroundColor: '#163f37', borderRadius: '50%' }}>
                            <i className="bi bi-gear-fill"></i>
                        </button>
                    )}
                    {!isSidebarOpen && geoJsonData && (
                        <button onClick={handleDownloadImage} disabled={isExporting} className="btn btn-warning position-absolute shadow fw-bold ignore-print" style={{ top: '15px', left: '65px', zIndex: 1040 }}>
                            {isExporting ? (
                                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generando...</>
                            ) : (
                                <><i className="bi bi-download me-2"></i>Descargar Mapa</>
                            )}
                        </button>
                    )}

                    <div ref={printRef} className="h-100 w-100 bg-white position-relative d-flex align-items-center justify-content-center" style={{ padding: '40px', boxSizing: 'border-box' }}>

                        <div className="w-100 h-100 position-relative" style={{ border: '2px solid black' }}>

                            {renderLabels()}
                            {renderZebraFrame()}

                            <div className="h-100 w-100 position-relative bg-white" style={{ outline: '1px solid black' }}>

                                <div aria-hidden="true" style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 1000, pointerEvents: 'none' }}>
                                    <svg width="45" height="45" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                        <polygon points="50,0 60,40 50,50 40,40" fill="black" />
                                        <polygon points="50,100 60,60 50,50 40,60" fill="white" stroke="black" />
                                        <polygon points="100,50 60,60 50,50 60,40" fill="black" />
                                        <polygon points="0,50 40,60 50,50 40,40" fill="white" stroke="black" />
                                        <circle cx="50" cy="50" r="8" fill="white" stroke="black" />
                                        <text x="50" y="-5" fontSize="22" textAnchor="middle" fill="black" fontWeight="bold">N</text>
                                    </svg>
                                </div>

                                {/* preferCanvas activado globalmente ayuda a html2canvas con vectores */}
                                <MapContainer center={mapCenter} zoom={6} zoomControl={false} preferCanvas={true} style={{ height: '100%', width: '100%' }}>
                                    <TileLayer opacity={0.75} crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                                    <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

                                    <GraticuleEngine />
                                    <MapUpdater data={geoJsonData} plano={currentPlano} />

                                    <div className="ignore-print" style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 1000, backgroundColor: 'rgba(255,255,255,0.7)', padding: '2px 5px', pointerEvents: 'none' }}>
                                        <ScaleControl position="bottomleft" imperial={false} />
                                    </div>

                                    {geoJsonData && <GeoJSON data={geoJsonData} style={featureStyle} pointToLayer={pointToLayer} onEachFeature={onEachFeature} />}
                                </MapContainer>

                                {previewData && (
                                    <div className="position-absolute bg-white p-3 shadow-sm" style={{ top: '15px', right: '15px', width: '290px', zIndex: 1000, border: '1px solid #000' }}>
                                        <div className="text-center mb-3 d-flex flex-column align-items-center">
                                            <img src={profepaLogo} alt="PROFEPA" style={{ height: '35px', marginBottom: '8px' }} />
                                            <h6 className="fw-bold mb-0" style={{ fontSize: '0.75rem', color: '#000' }}>PROCURADURÍA FEDERAL DE PROTECCIÓN AL AMBIENTE</h6>
                                            <span className="text-muted" style={{ fontSize: '0.6rem' }}>Subprocuraduría de Recursos Naturales</span>
                                        </div>

                                        <MiniMapLocator data={geoJsonData} estado={previewData.estado} municipio={previewData.municipio} />

                                        <div className="bg-white mb-2 border border-dark">
                                            <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Simbología</div>
                                            <div className="p-2">
                                                <div className="d-flex align-items-center mb-1">
                                                    <div style={{ width: '12px', height: '12px', backgroundColor: '#ff0000', border: '1px solid #000', marginRight: '8px' }}></div>
                                                    <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono(s) Inspeccionado(s)</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white mb-2 border border-dark">
                                            <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem', padding: '2px' }}>Datos de Superficie:</div>
                                            <div className="p-2 text-center">
                                                {areaDetails.map((item, idx) => (
                                                    <p key={`area-${idx}`} className="mb-1" style={{ fontSize: '0.65rem' }}><strong>{item.name}:</strong> {item.area} m²</p>
                                                ))}
                                                <div style={{ borderTop: '1px solid #ccc', margin: '4px 0' }}></div>
                                                <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Superficie Total:</strong> {totalArea} m²</p>
                                            </div>
                                        </div>

                                        <div className="bg-white mb-2 border border-dark">
                                            <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem', padding: '2px' }}>Sistema de Referencia:</div>
                                            <p className="mb-0 text-center p-1" style={{ fontSize: '0.65rem' }}>DATUM WGS84 Zona 14 N<br />Proyección Transversal de Mercator</p>
                                        </div>

                                        <div className="border border-dark mt-2 p-1 text-center" style={{ fontSize: '0.65rem' }}>
                                            <span className="fw-bold">Fecha de elaboración:</span> {previewData.targetDate}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {geoJsonData && (
                <div className="bg-dark text-white p-2 d-flex justify-content-center align-items-center gap-3 ignore-print" style={{ zIndex: 1050, borderTop: '3px solid #d6b56a' }}>
                    <span className="fw-bold" style={{ fontSize: '0.85rem' }}>Vistas disponibles:</span>
                    <button onClick={() => setCurrentPlano(0)} className={`btn btn-sm ${currentPlano === 0 ? 'btn-light fw-bold' : 'btn-outline-light'}`}>Visualizador General</button>
                    <button onClick={() => setCurrentPlano(1)} className={`btn btn-sm ${currentPlano === 1 ? 'btn-light fw-bold' : 'btn-outline-light'}`}>Plano 1 (Ubicación Geográfica)</button>
                    <button onClick={() => setCurrentPlano(2)} className={`btn btn-sm ${currentPlano === 2 ? 'btn-light fw-bold' : 'btn-outline-light'}`}>Plano 2 (Detalle)</button>
                </div>
            )}
        </div>
    );
};