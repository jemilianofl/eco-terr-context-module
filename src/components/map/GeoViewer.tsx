import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, ScaleControl, CircleMarker, useMapEvents, Polyline, Tooltip } from 'react-leaflet';
import { useForm } from 'react-hook-form';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type { FeatureCollection, Feature, GeoJsonObject, Polygon, MultiPolygon, Point } from 'geojson';
import L from 'leaflet';
import domtoimage from 'dom-to-image';
import * as turf from '@turf/turf';

import { toDMS } from '../../config/mapConfig';
import {
  useSentinelData,
  useEcoLayers,
  useVegetationLayers,
  useClimateLayers,
  useEdafologiaLayers,
} from '../../hooks/useMapLayers';
import { UserPolygonLayer, EcoLayer, VegLayer, ClimateLayer, EdafologiaLayer } from './MapLayers';
import {
  LegendUbicacion,
  LegendEcologica,
  LegendVegetacion,
  LegendClima,
  LegendEdafologia,
} from './MapLegends';

import profepaLogo from '../../assets/img/LOGO_PROFEPA.png';

// CRÍTICO: Forzamos a Leaflet a no usar animaciones 3D que confunden a html2canvas
(L.Browser as unknown as { any3d: boolean }).any3d = false;

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
  xTicks: { lon: number; x: number }[];
  yTicks: { lat: number; y: number }[];
}

const ViewportWatcher: React.FC<{ onBoundsChange: (bbox: [number, number, number, number]) => void }> = ({ onBoundsChange }) => {
  const map = useMap();
  const updateBounds = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }, [map, onBoundsChange]);

  useMapEvents({ moveend: updateBounds, zoomend: updateBounds });
  useEffect(() => { updateBounds(); }, [updateBounds]);
  return null;
};

const GraticuleEngine: React.FC = () => {
  const map = useMap();
  const [grid, setGrid] = useState<{ lats: number[]; lons: number[]; bounds: L.LatLngBounds | null }>({ lats: [], lons: [], bounds: null });

  const updateGrid = useCallback(() => {
    if (!map?.getContainer()) return;
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
    const xTicks = lons.map((lon) => ({ lon, x: map.latLngToContainerPoint([b.getSouth(), lon]).x }));
    const yTicks = lats.map((lat) => ({ lat, y: map.latLngToContainerPoint([lat, b.getWest()]).y }));
    document.dispatchEvent(new CustomEvent('mapFrameUpdated', { detail: { w: mapSize.x, h: mapSize.y, xTicks, yTicks } }));
  }, [map]);

  useMapEvents({ moveend: updateGrid, zoomend: updateGrid, resize: updateGrid });
  useEffect(() => {
    const timerId = setTimeout(() => updateGrid(), 0);
    return () => { clearTimeout(timerId); setGrid({ lats: [], lons: [], bounds: null }); };
  }, [updateGrid]);

  if (!grid.bounds) return null;

  return (
    <>
      {grid.lats.map((lat, i) => (
        <Polyline key={`lat-${i}-${lat}`} positions={[[lat, grid.bounds!.getWest()], [lat, grid.bounds!.getEast()]]} pathOptions={{ color: 'white', weight: 1.5, opacity: 0.5, dashArray: '5,5', interactive: false }} />
      ))}
      {grid.lons.map((lon, i) => (
        <Polyline key={`lon-${i}-${lon}`} positions={[[grid.bounds!.getSouth(), lon], [grid.bounds!.getNorth(), lon]]} pathOptions={{ color: 'white', weight: 1.5, opacity: 0.5, dashArray: '5,5', interactive: false }} />
      ))}
    </>
  );
};

const MapUpdater: React.FC<{
  data: FeatureCollection | null;
  plano: number;
  buffer10km: Feature<Polygon | MultiPolygon> | null;
  trigger: number;
}> = ({ data, plano, buffer10km, trigger }) => {
  const map = useMap();
  useEffect(() => {
    if (!data || data.features.length === 0) return;
    const paddingOpts = { paddingBottomRight: [330, 30] as [number, number], paddingTopLeft: [40, 40] as [number, number] };

    if (trigger > 0) {
      const layer = L.geoJSON(data);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { ...paddingOpts, maxZoom: 16 });
      return;
    }

    if (plano === 1) {
      const layer = L.geoJSON(data);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { ...paddingOpts, maxZoom: 18 });
    } else if (plano >= 2 && buffer10km) {
      const bbox = turf.bbox(buffer10km);
      map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], paddingOpts);
    }
  }, [data, plano, buffer10km, map, trigger]);
  return null;
};

const InvalidateMap: React.FC<{ dependencies: unknown[] }> = ({ dependencies }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize(true);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...dependencies]);
  return null;
};

const MiniMapLocator: React.FC<{ data: FeatureCollection | null; estado: string; municipio: string }> = ({ data, estado, municipio }) => {
  if (!data || data.features.length === 0) return null;
  const center = L.geoJSON(data).getBounds().getCenter();
  return (
    <div className="bg-white p-1 mb-2 border border-dark" style={{ overflow: 'hidden' }}>
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Localización geográfica</div>
      <div style={{ height: '110px', width: '100%', position: 'relative', border: '1px solid #444' }}>
        <MapContainer center={center} zoom={6} zoomControl={false} dragging={false} scrollWheelZoom={false} preferCanvas={true} style={{ height: '100%', width: '100%' }}>
          <InvalidateMap dependencies={[]} />
          <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
          <CircleMarker center={center} radius={4} color="black" weight={1} fillColor="red" fillOpacity={1} />
        </MapContainer>
      </div>
      <div className="text-center mt-1" style={{ fontSize: '0.65rem', lineHeight: '1.1' }}>
        Estado: {estado || 'N/A'}<br />Municipio: {municipio || 'N/A'}
      </div>
    </div>
  );
};

const SmartLabels: React.FC<{ data: FeatureCollection | null; plano: number }> = ({ data, plano }) => {
  if (plano !== 1 || !data) return null;
  return (
    <>
      {data.features.map((f, i) => {
        if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') return null;
        const polyId = typeof f.properties?.polyId === 'string' ? f.properties.polyId : null;
        if (!polyId) return null;
        try {
          const centroid = turf.centroid(f);
          const [lon, lat] = centroid.geometry.coordinates;
          const angles = [45, 135, 315, 225, 0, 180, 90, 270];
          const angleRad = angles[i % angles.length] * (Math.PI / 180);
          const offsetDist = 0.00025 * (1 + Math.floor(i / 8) * 0.3);
          const labelLat = lat + Math.sin(angleRad) * offsetDist;
          const labelLon = lon + Math.cos(angleRad) * offsetDist;

          return (
            <CircleMarker key={`smart-label-${polyId}`} center={[labelLat, labelLon]} radius={0} opacity={0} pane="markerPane">
              <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none p-0">
                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#ff0000', textShadow: '-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff' }}>
                  {polyId}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        } catch { return null; }
      })}
    </>
  );
};

export const GeoViewer: React.FC = () => {
  const { register, handleSubmit } = useForm<FormData>();
  const [mapCenter] = useState<[number, number]>([19.4326, -99.1332]);
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [previewData, setPreviewData] = useState<FormData | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentPlano, setCurrentPlano] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [frameData, setFrameData] = useState<FrameData | null>(null);
  const [mapRef, setMapRef] = useState<L.Map | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [selectedVegSerie, setSelectedVegSerie] = useState<string>('serie_7');
  const [currentViewportBbox, setCurrentViewportBbox] = useState<[number, number, number, number] | null>(null);

  useEffect(() => {
    const handler = (e: Event) => setFrameData((e as CustomEvent<FrameData>).detail);
    document.addEventListener('mapFrameUpdated', handler);
    return () => document.removeEventListener('mapFrameUpdated', handler);
  }, []);

  const buffer10km = useMemo<Feature<Polygon | MultiPolygon> | null>(() => {
    if (!geoJsonData || geoJsonData.features.length === 0) return null;
    try {
      const polys = turf.featureCollection(
        geoJsonData.features.filter((f) => f.geometry.type !== 'Point')
      );
      const buffered = turf.buffer(polys, 10, { units: 'kilometers' });
      if (!buffered || buffered.features.length === 0) return null;
      if (buffered.features.length === 1) return buffered.features[0];
      const coords = buffered.features.flatMap((feat) =>
        feat.geometry.type === 'Polygon'
          ? [feat.geometry.coordinates]
          : feat.geometry.coordinates
      );
      return turf.multiPolygon(coords);
    } catch {
      return null;
    }
  }, [geoJsonData]);

  const predioCentroid = useMemo<Feature<Point> | null>(() => {
    if (!geoJsonData || geoJsonData.features.length === 0) return null;
    try {
      return turf.centroid(geoJsonData);
    } catch { return null; }
  }, [geoJsonData]);

  const { sentinelUrl, sentinelMetadata, useSentinel, setUseSentinel } = useSentinelData(predioCentroid, previewData?.targetDate);
  const { ecoNearby, isLoadingEco } = useEcoLayers(buffer10km);
  const { vegNearby, isLoadingVeg } = useVegetationLayers(buffer10km, selectedVegSerie);
  const { climateNearby, isLoadingClimate } = useClimateLayers(buffer10km);
  const { edafologiaNearby, isLoadingEdafologia } = useEdafologiaLayers(buffer10km);

  const onSubmit = async (data: FormData) => {
    const files = data.polygonFile;
    if (!files || files.length === 0) return;
    setPreviewData(data);

    try {
      let parsedData: unknown = null;
      const zipFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith('.zip'));
      const kmlFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith('.kml'));
      const geoJsonFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith('.geojson'));

      if (zipFile) {
        parsedData = await shp(await zipFile.arrayBuffer());
        if (Array.isArray(parsedData)) parsedData = parsedData[0];
      } else if (kmlFile) {
        parsedData = kml(new DOMParser().parseFromString(await kmlFile.text(), 'text/xml'));
      } else if (geoJsonFile) {
        parsedData = JSON.parse(await geoJsonFile.text());
      }

      if ((parsedData as GeoJsonObject)?.type !== 'FeatureCollection') {
        parsedData = { type: 'FeatureCollection', features: [parsedData as Feature] };
      }

      let polyIndex = 0;
      const cleanFeatures = (parsedData as FeatureCollection).features.map((f) => {
        const finalF = turf.truncate(f, { precision: 6, coordinates: 2 });
        if (finalF.geometry.type !== 'Point') {
          finalF.properties = finalF.properties || {};
          finalF.properties.polyId = String.fromCodePoint(65 + polyIndex);
          polyIndex++;
        }
        return finalF;
      });

      setGeoJsonData({ type: 'FeatureCollection', features: cleanFeatures });
      setIsSidebarOpen(false);
    } catch (err) {
      console.warn('Error procesando el archivo espacial:', err);
      alert('Error procesando el archivo espacial.');
    }
  };

  const handleDownloadImage = () => {
    if (!printRef.current) return;

    setIsExporting(true);
    window.scrollTo(0, 0);

    if (mapRef) {
      mapRef.setView(mapRef.getCenter(), mapRef.getZoom(), { animate: false });
    }

    setTimeout(() => {
      domtoimage.toJpeg(printRef.current!, {
        quality: 0.95,
        bgcolor: '#ffffff',
        style: {
          margin: '0',
        },
        filter: (node: Node) => {
          if (node instanceof HTMLElement) {
            return !node.classList.contains('ignore-print') &&
                   !node.classList.contains('leaflet-control-container');
          }
          return true;
        }
      })
      .then((dataUrl) => {
        const link = document.createElement('a');
        const planoNames: Record<number, string> = {
          1: 'Ubicacion_Geografica',
          2: 'Relevancia_Ecologica',
          3: 'Tipo_Vegetacion',
          4: 'Unidades_Climaticas',
          5: 'Edafologia',
        };
        const planoName = planoNames[currentPlano] ?? 'Ubicacion_Geografica';
        link.download = `Mapa_Oficial_${previewData?.expediente || 'Dictamen'}_${planoName}.jpg`;
        link.href = dataUrl;
        link.click();
      })
      .catch((error) => {
        console.error('Error al exportar la imagen:', error);
        alert('Error al generar la imagen.');
      })
      .finally(() => {
        setIsExporting(false);
      });
    }, 800);
  };

  const { totalArea, areaDetails } = useMemo(() => {
    if (!geoJsonData) return { totalArea: '0.00', areaDetails: [] };
    let areaSum = 0;
    const details: { name: string; area: string }[] = [];
    geoJsonData.features.forEach((f) => {
      if (f.geometry.type === 'Point') return;
      const polyId = typeof f.properties?.polyId === 'string' ? f.properties.polyId : null;
      try {
        const a = turf.area(f);
        areaSum += a;
        if (polyId) details.push({ name: `Polígono ${polyId}`, area: a.toFixed(2) });
      } catch { /* ignored */ }
    });
    return { totalArea: areaSum.toFixed(2), areaDetails: details };
  }, [geoJsonData]);

  const renderZebraFrame = () => {
    if (!frameData) return null;
    const { w, h, xTicks, yTicks } = frameData;
    const borderWeight = 8;
    const xEdges = [0, ...xTicks.map((t) => t.x).filter((x) => x > 0 && x < w).sort((a, b) => a - b), w];
    const yEdges = [0, ...yTicks.map((t) => t.y).filter((y) => y > 0 && y < h).sort((a, b) => a - b), h];
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
    const labelStyle: React.CSSProperties = { position: 'absolute', fontSize: '0.65rem', fontWeight: 'bold', color: 'black', whiteSpace: 'nowrap', zIndex: 10, textAlign: 'center' };
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

  const nombresPlanos = ['Plano 1', 'Plano 2', 'Plano 3', 'Plano 4', 'Plano 5'];
  const nombreActual = nombresPlanos[currentPlano - 1];
  const isAnyLayerLoading = isLoadingEco || isLoadingVeg || isLoadingClimate || isLoadingEdafologia;

  return (
    <div className="container-fluid my-4 px-2 d-flex flex-column position-relative shadow-sm rounded border" style={{ minHeight: '850px', backgroundColor: '#f8f9fa', zIndex: 1, isolation: 'isolate' }}>
      <div className="d-flex flex-grow-1 position-relative overflow-hidden w-100 rounded">

        {/* PANEL LATERAL */}
        <div className={`bg-white border-end shadow-sm overflow-auto transition-all ${isSidebarOpen ? 'd-block' : 'd-none'}`} style={{ zIndex: 1050, width: '320px', position: 'absolute', height: '100%', left: 0 }}>
          <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
            <h5 className="fw-bold mb-0" style={{ color: '#163f37' }}>Datos del Dictamen</h5>
            <button type="button" className="btn-close" onClick={() => setIsSidebarOpen(false)} aria-label="Close"></button>
          </div>
          <div className="p-3">
            <form
              onSubmit={(e) => {
                void handleSubmit(onSubmit)(e);
              }}
              className="d-flex flex-column gap-3"
            >
              <div>
                <label htmlFor="expId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Expediente</label>
                <input id="expId" type="text" className="form-control form-control-sm" {...register('expediente', { required: true })} />
              </div>
              <div>
                <label htmlFor="actId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Acta de Inspección</label>
                <input id="actId" type="text" className="form-control form-control-sm" {...register('acta')} />
              </div>
              <div>
                <label htmlFor="datId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Fecha de Inspección</label>
                <input id="datId" type="date" className="form-control form-control-sm" {...register('targetDate', { required: true })} />
              </div>
              <div className="row">
                <div className="col-6">
                  <label htmlFor="estId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Estado</label>
                  <input id="estId" type="text" className="form-control form-control-sm" {...register('estado')} />
                </div>
                <div className="col-6">
                  <label htmlFor="munId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Municipio</label>
                  <input id="munId" type="text" className="form-control form-control-sm" {...register('municipio')} />
                </div>
              </div>
              <div>
                <label htmlFor="vegId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Tipo de Vegetación</label>
                <input id="vegId" type="text" className="form-control form-control-sm" {...register('vegetacion')} />
              </div>
              <div>
                <label htmlFor="fileId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>Cargar Archivos Espaciales</label>
                <input id="fileId" type="file" accept=".geojson,.kml,.zip" className="form-control form-control-sm" {...register('polygonFile', { required: true })} />
              </div>
              <button type="submit" className="btn text-white fw-bold mt-2" style={{ backgroundColor: '#163f37' }}>
                Generar Previsualización
              </button>
            </form>
          </div>
        </div>

        {/* ÁREA CENTRAL Y LIENZO CARTOGRÁFICO */}
        <div className="flex-grow-1 position-relative p-0 d-flex flex-column align-items-center" style={{ backgroundColor: '#e9ecef', overflowY: 'auto' }}>
          {!isSidebarOpen && (
            <button type="button" onClick={() => setIsSidebarOpen(true)} className="btn text-white position-absolute shadow ignore-print" style={{ top: '15px', left: '15px', zIndex: 1040, backgroundColor: '#163f37', borderRadius: '50%' }}>
              <i className="bi bi-gear-fill"></i>
            </button>
          )}
          {!isSidebarOpen && geoJsonData && (
            <button type="button" onClick={handleDownloadImage} disabled={isExporting} className="btn btn-warning position-absolute shadow fw-bold ignore-print" style={{ top: '15px', left: '65px', zIndex: 1040 }}>
              {isExporting ? (
                <><output className="spinner-border spinner-border-sm me-2" aria-hidden="true"></output>Generando...</>
              ) : (
                <><i className="bi bi-download me-2"></i>Descargar {nombreActual}</>
              )}
            </button>
          )}

          <div style={{ marginTop: '40px', marginBottom: '20px' }}>
            <div
              ref={printRef}
              className="bg-white position-relative d-flex align-items-center justify-content-center"
              style={{ padding: '40px', boxSizing: 'border-box', width: '11in', height: '8.5in' }}
            >
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

                  {isAnyLayerLoading && (
                    <output className="position-absolute d-flex align-items-center justify-content-center bg-white bg-opacity-75 shadow-sm rounded px-3 py-2 ignore-print" style={{ top: '15px', left: '70px', zIndex: 1100 }}>
                      <span className="spinner-border spinner-border-sm text-success me-2" aria-hidden="true"></span>
                      <span className="small fw-semibold text-dark">Consultando coberturas en R2...</span>
                    </output>
                  )}

                  <MapContainer ref={setMapRef} center={mapCenter} zoom={6} maxZoom={18} zoomControl={false} preferCanvas={false} style={{ height: '100%', width: '100%' }}>
                    <ViewportWatcher onBoundsChange={setCurrentViewportBbox} />

                    {/* CRÍTICO: isExporting no está en las dependencias. Esto evita que el canvas se limpie antes de capturar */}
                    <InvalidateMap dependencies={[geoJsonData, useSentinel, isSidebarOpen, selectedVegSerie]} />

                    {useSentinel && sentinelUrl && currentPlano === 1 ? (
                      <TileLayer crossOrigin="anonymous" url={sentinelUrl} opacity={1} maxNativeZoom={15} maxZoom={18} />
                    ) : (
                      <TileLayer opacity={0.75} crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={18} maxZoom={18} />
                    )}

                    <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={18} maxZoom={18} />

                    <GraticuleEngine />
                    <MapUpdater data={geoJsonData} plano={currentPlano} buffer10km={buffer10km} trigger={recenterTrigger} />

                    <div className="ignore-print" style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 1000, backgroundColor: 'rgba(255,255,255,0.7)', padding: '2px 5px', pointerEvents: 'none' }}>
                      <ScaleControl position="bottomleft" imperial={false} />
                    </div>

                    {currentPlano === 2 && <EcoLayer key={`eco-${currentPlano}`} ecoNearby={ecoNearby} />}
                    {currentPlano === 3 && <VegLayer key={`veg-${currentPlano}-${selectedVegSerie}`} vegNearby={vegNearby} />}
                    {currentPlano === 4 && <ClimateLayer key={`climate-${currentPlano}`} climateNearby={climateNearby} />}
                    {currentPlano === 5 && <EdafologiaLayer key={`edafologia-${currentPlano}`} edafologiaNearby={edafologiaNearby} />}

                    {geoJsonData && <UserPolygonLayer key={`user-layer-${currentPlano}`} geoJsonData={geoJsonData} />}
                    {currentPlano === 1 && <SmartLabels data={geoJsonData} plano={currentPlano} />}

                  </MapContainer>

                  {previewData && (
                    <div className="position-absolute bg-white p-3 shadow-sm" style={{ top: '15px', right: '15px', width: '290px', zIndex: 1000, border: '1px solid #000' }}>
                      <div className="text-center mb-3 d-flex flex-column align-items-center">
                        <img src={profepaLogo} alt="PROFEPA" style={{ height: '35px', marginBottom: '8px' }} />
                        <h6 className="fw-bold mb-0" style={{ fontSize: '0.75rem', color: '#000' }}>PROCURADURÍA FEDERAL DE PROTECCIÓN AL AMBIENTE</h6>
                        <span className="text-muted" style={{ fontSize: '0.6rem' }}>Subprocuraduría de Recursos Naturales</span>
                      </div>

                      <MiniMapLocator data={geoJsonData} estado={previewData.estado} municipio={previewData.municipio} />

                      {currentPlano === 1 && <LegendUbicacion previewData={previewData} useSentinel={useSentinel} sentinelMetadata={sentinelMetadata} areaDetails={areaDetails} totalArea={totalArea} />}
                      {currentPlano === 2 && <LegendEcologica ecoNearby={ecoNearby} isLoading={isLoadingEco} targetDate={previewData.targetDate} currentViewportBbox={currentViewportBbox} />}
                      {currentPlano === 3 && (
                        <LegendVegetacion
                          vegNearby={vegNearby}
                          selectedVegSerie={selectedVegSerie}
                          setSelectedVegSerie={setSelectedVegSerie}
                          currentViewportBbox={currentViewportBbox}
                          targetDate={previewData.targetDate}
                          isLoading={isLoadingVeg}
                          isExporting={isExporting}
                        />
                      )}
                      {currentPlano === 4 && <LegendClima climateNearby={climateNearby} isLoading={isLoadingClimate} targetDate={previewData.targetDate} currentViewportBbox={currentViewportBbox} />}
                      {currentPlano === 5 && <LegendEdafologia edafologiaNearby={edafologiaNearby} isLoading={isLoadingEdafologia} targetDate={previewData.targetDate} currentViewportBbox={currentViewportBbox} />}

                      <div className="bg-white mb-2 border border-dark mt-2">
                        <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem', padding: '2px' }}>Sistema de Referencia:</div>
                        <p className="mb-0 text-center p-1" style={{ fontSize: '0.65rem' }}>DATUM WGS84 Zona 14 N<br />Proyección Transversal de Mercator</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {geoJsonData && (
            <div className="bg-dark text-white p-3 d-flex flex-wrap justify-content-center align-items-center gap-2 ignore-print mb-4 shadow rounded w-100" style={{ maxWidth: '1050px', borderTop: '4px solid #d6b56a' }}>
              <span className="fw-bold me-1" style={{ fontSize: '0.9rem' }}>Vistas:</span>
              <button type="button" onClick={() => setCurrentPlano(1)} className={`btn btn-sm ${currentPlano === 1 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}>
                <i className="bi bi-geo-alt me-1"></i> Ubicación Geográfica
              </button>
              <button type="button" onClick={() => setCurrentPlano(2)} className={`btn btn-sm ${currentPlano === 2 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}>
                <i className="bi bi-tree me-1"></i> Relevancia Ecológica
              </button>
              <button type="button" onClick={() => setCurrentPlano(3)} className={`btn btn-sm ${currentPlano === 3 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}>
                <i className="bi bi-flower1 me-1"></i> Tipo de Vegetación
              </button>
              <button type="button" onClick={() => setCurrentPlano(4)} className={`btn btn-sm ${currentPlano === 4 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}>
                <i className="bi bi-cloud-sun me-1"></i> Unidades Climáticas
              </button>
              <button type="button" onClick={() => setCurrentPlano(5)} className={`btn btn-sm ${currentPlano === 5 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}>
                <i className="bi bi-layers me-1"></i> Edafología
              </button>

              <div className="vr bg-light mx-1" style={{ opacity: 0.5, height: '24px' }}></div>

              <button type="button" onClick={() => setRecenterTrigger(prev => prev + 1)} className="btn btn-sm btn-outline-warning" title="Encuadrar la vista sobre el polígono inspeccionado">
                <i className="bi bi-arrows-collapse me-1"></i> Centrar Polígono
              </button>

              {sentinelUrl && currentPlano === 1 && (
                <>
                  <div className="vr bg-light mx-1" style={{ opacity: 0.5, height: '24px' }}></div>
                  <button type="button" onClick={() => setUseSentinel(!useSentinel)} className={`btn btn-sm ${useSentinel ? 'btn-primary' : 'btn-outline-primary'}`}>
                    <i className="bi bi-satellite me-1"></i> {useSentinel ? 'Sentinel-2 (Temporal)' : 'ESRI (Alta Res)'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};