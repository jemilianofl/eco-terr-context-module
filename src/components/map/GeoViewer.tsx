import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, ScaleControl, CircleMarker, useMapEvents, Polyline, Tooltip } from 'react-leaflet';
import { useForm, type UseFormRegister, type UseFormHandleSubmit } from 'react-hook-form';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type { FeatureCollection, Feature, GeoJsonObject, Polygon, MultiPolygon, Point } from 'geojson';
import L from 'leaflet';
import domtoimage from 'dom-to-image';
import * as turf from '@turf/turf';

import { toDMS, getStrahlerOrderNumber } from '../../config/mapConfig';
import {
  GisBackendUnavailableError,
  parseSpatialFileViaBackend,
  type LayerFilterMode,
} from '../../utils/gisApiClient';
import {
  useSentinelData,
  useTemporalImagery,
  useEcoLayers,
  useVegetationLayers,
  useClimateLayers,
  useEdafologiaLayers,
  useHidrologiaLayers,
  type TypedMapFeature,
  type TemporalSceneItem,
  type SatelliteCollectionOption,
  type SpectralPreset,
} from '../../hooks/useMapLayers';
import {
  UserPolygonLayer,
  EcoLayer,
  VegLayer,
  ClimateLayer,
  EdafologiaLayer,
  HidrologiaLayer,
} from './MapLayers';
import {
  LegendUbicacion,
  LegendEcologica,
  LegendVegetacion,
  LegendClima,
  LegendEdafologia,
  LegendHidrologia,
  LegendEspacioTemporal,
} from './MapLegends';

import profepaLogo from '../../assets/img/LOGO_PROFEPA.png';

// CRÍTICO: Forzamos a Leaflet a no usar animaciones 3D que confunden a html2canvas
(L.Browser as unknown as { any3d: boolean }).any3d = false;

interface FormData {
  targetDate: string;
  polygonFile: FileList;
  microcuencaFile?: FileList;
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

const PLANO_FILE_NAMES: Record<number, string> = {
  1: 'Ubicacion_Geografica',
  2: 'Relevancia_Ecologica',
  3: 'Tipo_Vegetacion',
  4: 'Unidades_Climaticas',
  5: 'Edafologia',
  6: 'Hidrologia_Cuencas_Corrientes',
  7: 'Analisis_Espacio_Temporal',
};

const NOMBRES_PLANOS = ['Plano 1', 'Plano 2', 'Plano 3', 'Plano 4', 'Plano 5', 'Plano 6', 'Plano 7'];

async function parseSpatialFileListLocal(files: FileList): Promise<FeatureCollection> {
  let parsedData: unknown = null;
  const fileArray = Array.from(files);
  const zipFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.zip'));
  const kmlFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.kml'));
  const geoJsonFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.geojson'));

  if (zipFile) {
    parsedData = await shp(await zipFile.arrayBuffer());
    if (Array.isArray(parsedData)) parsedData = parsedData[0];
  } else if (kmlFile) {
    parsedData = kml(new DOMParser().parseFromString(await kmlFile.text(), 'text/xml'));
  } else if (geoJsonFile) {
    parsedData = JSON.parse(await geoJsonFile.text());
  }

  let collection: FeatureCollection;
  if ((parsedData as GeoJsonObject)?.type !== 'FeatureCollection') {
    collection = { type: 'FeatureCollection', features: [parsedData as Feature] };
  } else {
    collection = parsedData as FeatureCollection;
  }

  let polyIndex = 0;
  const cleanFeatures = collection.features.map((f) => {
    const finalF = turf.truncate(f, { precision: 6, coordinates: 2 });
    if (finalF.geometry.type !== 'Point') {
      finalF.properties = finalF.properties || {};
      finalF.properties.polyId = String.fromCodePoint(65 + polyIndex);
      polyIndex++;
    }
    return finalF;
  });

  return { type: 'FeatureCollection', features: cleanFeatures };
}

async function parseSpatialFilesWithFallback(files: FileList): Promise<FeatureCollection> {
  if (files.length === 1) {
    try {
      const backendParsed = await parseSpatialFileViaBackend(files[0]);
      return backendParsed.featureCollection;
    } catch (error) {
      if (!(error instanceof GisBackendUnavailableError)) {
        throw error;
      }
    }
  }
  return await parseSpatialFileListLocal(files);
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
  filterMode: LayerFilterMode;
  trigger: number;
}> = ({ data, plano, filterMode, trigger }) => {
  const map = useMap();
  useEffect(() => {
    if (!data || data.features.length === 0) return;
    map.invalidateSize(false);

    const layer = L.geoJSON(data);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: plano === 7 ? [110, 110] : [40, 40],
        maxZoom: plano === 7 ? 15 : 16,
      });
    }
  }, [data, plano, filterMode, map, trigger]);
  return null;
};

const ZoomCenterOnPolygon: React.FC<{ data: FeatureCollection | null }> = ({ data }) => {
  const map = useMap();
  const isAdjustingRef = useRef(false);

  useMapEvents({
    zoomend() {
      if (isAdjustingRef.current || !data || data.features.length === 0) return;
      const layer = L.geoJSON(data);
      const bounds = layer.getBounds();
      if (!bounds.isValid()) return;

      const polyCenter = bounds.getCenter();
      const zoom = map.getZoom();

      if (!map.getCenter().equals(polyCenter, 1e-6)) {
        isAdjustingRef.current = true;
        map.setView(polyCenter, zoom, { animate: false });
        requestAnimationFrame(() => {
          isAdjustingRef.current = false;
        });
      }
    },
  });

  return null;
};

const InvalidateMap: React.FC<{ dependencies: unknown[] }> = ({ dependencies }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize(true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...dependencies]);
  return null;
};

const MiniMapViewSync: React.FC<{
  center: L.LatLngExpression;
  plano: number;
  buffer10km: Feature<Polygon | MultiPolygon> | null;
}> = ({ center, plano, buffer10km }) => {
  const map = useMap();
  useEffect(() => {
    if (plano >= 2 && plano <= 6 && buffer10km) {
      const [minX, minY, maxX, maxY] = turf.bbox(buffer10km);
      map.fitBounds(
        [
          [minY, minX],
          [maxY, maxX],
        ],
        { padding: [6, 6], maxZoom: 10, animate: false }
      );
    } else {
      map.setView(center, 6, { animate: false });
    }
  }, [map, center, plano, buffer10km]);
  return null;
};

interface MiniMapLocatorProps {
  data: FeatureCollection | null;
  buffer10km: Feature<Polygon | MultiPolygon> | null;
  currentPlano: number;
  selectedVegSerie: string;
  ecoNearby: TypedMapFeature[];
  vegNearby: TypedMapFeature[];
  climateNearby: TypedMapFeature[];
  edafologiaNearby: TypedMapFeature[];
  cuencasNearby: TypedMapFeature[];
  subcuencasNearby: TypedMapFeature[];
  cuerposAguaNearby: TypedMapFeature[];
  corrientesNearby: TypedMapFeature[];
  microcuencaData: FeatureCollection | null;
  estado: string;
  municipio: string;
}

const MiniMapLocator: React.FC<MiniMapLocatorProps> = ({
  data,
  buffer10km,
  currentPlano,
  selectedVegSerie,
  ecoNearby,
  vegNearby,
  climateNearby,
  edafologiaNearby,
  cuencasNearby,
  subcuencasNearby,
  cuerposAguaNearby,
  corrientesNearby,
  microcuencaData,
  estado,
  municipio,
}) => {
  if (!data || data.features.length === 0) return null;
  const center = L.geoJSON(data).getBounds().getCenter();

  return (
    <div className="bg-white p-1 mb-2 border border-dark">
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.72rem', padding: '2px' }}>
        Localización geográfica
      </div>
      <div style={{ height: '105px', width: '100%', position: 'relative', border: '1px solid #444' }}>
        <MapContainer
          center={center}
          zoom={6}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          boxZoom={false}
          keyboard={false}
          preferCanvas={false}
          style={{ height: '100%', width: '100%' }}
        >
          <InvalidateMap dependencies={[data, currentPlano, selectedVegSerie]} />
          <MiniMapViewSync center={center} plano={currentPlano} buffer10km={buffer10km} />
          <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />

          {currentPlano === 2 && <EcoLayer key="mini-eco" ecoNearby={ecoNearby} interactive={false} />}
          {currentPlano === 3 && <VegLayer key={`mini-veg-${selectedVegSerie}`} vegNearby={vegNearby} interactive={false} />}
          {currentPlano === 4 && <ClimateLayer key="mini-climate" climateNearby={climateNearby} interactive={false} />}
          {currentPlano === 5 && <EdafologiaLayer key="mini-edaf" edafologiaNearby={edafologiaNearby} interactive={false} />}
          {currentPlano === 6 && (
            <HidrologiaLayer
              key="mini-hidro"
              cuencasNearby={cuencasNearby}
              subcuencasNearby={subcuencasNearby}
              cuerposAguaNearby={cuerposAguaNearby}
              corrientesNearby={corrientesNearby}
              microcuencaData={microcuencaData}
              interactive={false}
            />
          )}

          <UserPolygonLayer geoJsonData={data} interactive={false} />
          <CircleMarker center={center} radius={3.5} color="black" weight={1} fillColor="red" fillOpacity={1} interactive={false} />
        </MapContainer>
      </div>
      <div className="text-center mt-1" style={{ fontSize: '0.62rem', lineHeight: '1.15' }}>
        Estado: {estado || 'N/A'}<br />Municipio: {municipio || 'N/A'}
      </div>
    </div>
  );
};

const SmartLabels: React.FC<{ data: FeatureCollection | null; plano: number }> = ({ data, plano }) => {
  if ((plano !== 1 && plano !== 7) || !data) return null;
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

const ZebraFrame: React.FC<{ frameData: FrameData | null }> = ({ frameData }) => {
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
  return <>{segments}</>;
};

const CoordinateLabels: React.FC<{ frameData: FrameData | null }> = ({ frameData }) => {
  if (!frameData) return null;
  const { w, h, xTicks, yTicks } = frameData;
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: '0.62rem',
    fontWeight: 'bold',
    lineHeight: 1,
    color: 'black',
    whiteSpace: 'nowrap',
    zIndex: 10,
    textAlign: 'center',
    pointerEvents: 'none',
  };
  const elements: React.ReactNode[] = [];

  xTicks.forEach((tick) => {
    if (tick.x > 0 && tick.x < w) {
      elements.push(
        <div key={`b-${tick.lon}-${tick.x}`} style={{ ...labelStyle, left: tick.x, bottom: '-14px', transform: 'translate(-50%, 50%)' }}>{toDMS(tick.lon, false)}</div>,
        <div key={`t-${tick.lon}-${tick.x}`} style={{ ...labelStyle, left: tick.x, top: '-14px', transform: 'translate(-50%, -50%)' }}>{toDMS(tick.lon, false)}</div>
      );
    }
  });
  yTicks.forEach((tick) => {
    if (tick.y > 0 && tick.y < h) {
      elements.push(
        <div key={`l-${tick.lat}-${tick.y}`} style={{ ...labelStyle, left: '-14px', top: tick.y, transform: 'translate(-50%, -50%) rotate(-90deg)' }}>{toDMS(tick.lat, true)}</div>,
        <div key={`r-${tick.lat}-${tick.y}`} style={{ ...labelStyle, right: '-14px', top: tick.y, transform: 'translate(50%, -50%) rotate(90deg)' }}>{toDMS(tick.lat, true)}</div>
      );
    }
  });
  return <>{elements}</>;
};

const BaseSatelliteTileLayer: React.FC<{
  currentPlano: number;
  activeTemporalScene: TemporalSceneItem | null;
  useSentinel: boolean;
  sentinelUrl: string | null;
}> = ({ currentPlano, activeTemporalScene, useSentinel, sentinelUrl }) => {
  if (currentPlano === 7 && activeTemporalScene) {
    return (
      <TileLayer
        key={activeTemporalScene.tileUrl}
        crossOrigin="anonymous"
        url={activeTemporalScene.tileUrl}
        opacity={1}
        maxNativeZoom={18}
        maxZoom={18}
      />
    );
  }

  if (useSentinel && sentinelUrl && currentPlano === 1) {
    return (
      <TileLayer
        crossOrigin="anonymous"
        url={sentinelUrl}
        opacity={1}
        maxNativeZoom={18}
        maxZoom={18}
      />
    );
  }

  const imageryOpacity = currentPlano === 1 || currentPlano === 7 ? 0.85 : 0.55;
  return (
    <TileLayer
      opacity={imageryOpacity}
      crossOrigin="anonymous"
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      maxNativeZoom={18}
      maxZoom={18}
    />
  );
};

const SidebarFormPanel: React.FC<{
  isSidebarOpen: boolean;
  onClose: () => void;
  register: UseFormRegister<FormData>;
  handleSubmit: UseFormHandleSubmit<FormData>;
  onSubmit: (data: FormData) => Promise<void>;
}> = ({ isSidebarOpen, onClose, register, handleSubmit, onSubmit }) => (
  <div
    className={`bg-white border-end shadow-sm overflow-auto transition-all ${isSidebarOpen ? 'd-block' : 'd-none'}`}
    style={{ zIndex: 1050, width: '320px', position: 'absolute', height: '100%', left: 0 }}
  >
    <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
      <h5 className="fw-bold mb-0" style={{ color: '#163f37' }}>Datos del Dictamen</h5>
      <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
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
        <div>
          <label htmlFor="microFileId" className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
            Microcuenca SIATL <span className="text-muted fw-normal">(Opcional)</span>
          </label>
          <input id="microFileId" type="file" accept=".geojson,.kml,.zip" className="form-control form-control-sm" {...register('microcuencaFile')} />
        </div>
        <button type="submit" className="btn text-white fw-bold mt-2" style={{ backgroundColor: '#163f37' }}>
          Generar Previsualización
        </button>
      </form>
    </div>
  </div>
);

const LayerFilterBar: React.FC<{
  layerFilterMode: LayerFilterMode;
  setLayerFilterMode: (mode: LayerFilterMode) => void;
}> = ({ layerFilterMode, setLayerFilterMode }) => (
  <div className="bg-white border shadow-sm rounded px-3 py-2 d-flex flex-wrap justify-content-between align-items-center gap-3 w-100">
    <div className="d-flex align-items-center gap-2">
      <i className="bi bi-funnel-fill" style={{ color: '#163f37' }}></i>
      <span className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>
        Criterio de activación de capas:
      </span>
    </div>

    <div className="btn-group btn-group-sm" aria-label="Criterio de activación de capas">
      <button
        type="button"
        onClick={() => setLayerFilterMode('intersect')}
        className={`btn ${layerFilterMode === 'intersect' ? 'text-white fw-bold' : 'btn-outline-secondary'}`}
        style={layerFilterMode === 'intersect' ? { backgroundColor: '#163f37', borderColor: '#163f37' } : undefined}
      >
        <i className="bi bi-bullseye me-1"></i>
        Capas intersectadas
      </button>
      <button
        type="button"
        onClick={() => setLayerFilterMode('buffer10km')}
        className={`btn ${layerFilterMode === 'buffer10km' ? 'text-white fw-bold' : 'btn-outline-secondary'}`}
        style={layerFilterMode === 'buffer10km' ? { backgroundColor: '#163f37', borderColor: '#163f37' } : undefined}
      >
        <i className="bi bi-record-circle me-1"></i>
        Buffer 10 KM
      </button>
    </div>

    <span className="text-muted" style={{ fontSize: '0.78rem' }}>
      {layerFilterMode === 'intersect'
        ? 'Activa solo las capas y coberturas que intersectan el polígono.'
        : 'Activa todas las coberturas dentro del radio de 10 km.'}
    </span>
  </div>
);

const TemporalControlPanel: React.FC<{
  temporalYear: number;
  setTemporalYear: (val: number) => void;
  temporalCollection: SatelliteCollectionOption;
  setTemporalCollection: (val: SatelliteCollectionOption) => void;
  temporalPreset: SpectralPreset;
  setTemporalPreset: (val: SpectralPreset) => void;
  activeScene: TemporalSceneItem | null;
  isLoadingTemporal: boolean;
  temporalError: string | null;
}> = ({
  temporalYear,
  setTemporalYear,
  temporalCollection,
  setTemporalCollection,
  temporalPreset,
  setTemporalPreset,
  activeScene,
  isLoadingTemporal,
  temporalError,
}) => {
  const currentYear = new Date().getFullYear();
  const startYear = temporalCollection === 'sentinel-2-l2a' ? 2015 : 1984;
  const years: number[] = [];
  for (let y = currentYear; y >= startYear; y--) {
    years.push(y);
  }

  const handleCollectionChange = (newCol: SatelliteCollectionOption) => {
    setTemporalCollection(newCol);
    if (newCol === 'sentinel-2-l2a' && temporalYear < 2015) {
    setTemporalYear(2015);
  }
  };

  return (
    <div className="bg-white border shadow-sm rounded px-3 py-2 d-flex flex-wrap align-items-end gap-3 w-100">
      <div>
        <label htmlFor="tempCollection" className="form-label fw-bold mb-1" style={{ fontSize: '0.75rem' }}>
          Catálogo satelital:
        </label>
        <select
          id="tempCollection"
          className="form-select form-select-sm"
          value={temporalCollection}
          onChange={(e) => handleCollectionChange(e.target.value as SatelliteCollectionOption)}
        >
          <option value="sentinel-2-l2a">Copernicus Sentinel-2 (2015–hoy)</option>
          <option value="landsat-c2-l2">Landsat 4-9 Histórico (1984–hoy)</option>
        </select>
      </div>

      <div>
        <label htmlFor="tempYearSelect" className="form-label fw-bold mb-1" style={{ fontSize: '0.75rem' }}>
          Año de consulta:
        </label>
        <select
          id="tempYearSelect"
          className="form-select form-select-sm"
          value={temporalYear}
          onChange={(e) => setTemporalYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tempPreset" className="form-label fw-bold mb-1" style={{ fontSize: '0.75rem' }}>
          Composición espectral:
        </label>
        <select
          id="tempPreset"
          className="form-select form-select-sm"
          value={temporalPreset}
          onChange={(e) => setTemporalPreset(e.target.value as SpectralPreset)}
        >
          <option value="rgb">Color Natural (RGB)</option>
          <option value="nir">Infrarrojo (Vegetación)</option>
          <option value="swir">SWIR (Suelo / Incendios)</option>
          <option value="ndvi">Índice NDVI (Vigor Vegetal)</option>
        </select>
      </div>

      <div className="flex-grow-1" style={{ minWidth: '220px' }}>
        <span className="form-label fw-bold mb-1 d-block" style={{ fontSize: '0.75rem' }}>
          Mejor escena seleccionada del año:
        </span>
        <div className="form-control form-control-sm bg-light text-truncate">
          {isLoadingTemporal && 'Consultando escena anual...'}
          {!isLoadingTemporal && activeScene && (
            <>
              <strong>{new Date(activeScene.date).toLocaleDateString('es-MX')}</strong> —{' '}
              {activeScene.platform.toUpperCase()} ({activeScene.cloudCover}% nubes)
            </>
          )}
          {!isLoadingTemporal && !activeScene && 'Sin escena disponible'}
        </div>
      </div>

      {temporalError && (
        <div className="w-100 text-danger small fw-semibold mt-1">
          <i className="bi bi-exclamation-triangle-fill me-1"></i>
          {' '}
          {temporalError}
        </div>
      )}
    </div>
  );
};

const PLANO_BUTTONS = [
  { id: 1, icon: 'bi-geo-alt', label: 'Ubicación Geográfica' },
  { id: 2, icon: 'bi-tree', label: 'Relevancia Ecológica' },
  { id: 3, icon: 'bi-flower1', label: 'Tipo de Vegetación' },
  { id: 4, icon: 'bi-cloud-sun', label: 'Unidades Climáticas' },
  { id: 5, icon: 'bi-layers', label: 'Edafología' },
  { id: 6, icon: 'bi-water', label: 'Hidrología' },
  { id: 7, icon: 'bi-clock-history', label: 'Espacio Temporal' },
] as const;

const PlanosNavBar: React.FC<{
  currentPlano: number;
  onSelectPlano: (plano: number) => void;
  onRecenter: () => void;
  sentinelUrl: string | null;
  useSentinel: boolean;
  setUseSentinel: (val: boolean) => void;
}> = ({ currentPlano, onSelectPlano, onRecenter, sentinelUrl, useSentinel, setUseSentinel }) => (
  <div
    className="bg-dark text-white p-3 d-flex flex-wrap justify-content-center align-items-center gap-2 shadow rounded w-100"
    style={{ borderTop: '4px solid #d6b56a' }}
  >
    <span className="fw-bold me-1" style={{ fontSize: '0.9rem' }}>Vistas:</span>
    {PLANO_BUTTONS.map((btn) => (
      <button
        key={btn.id}
        type="button"
        onClick={() => onSelectPlano(btn.id)}
        className={`btn btn-sm ${currentPlano === btn.id ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}
      >
        <i className={`bi ${btn.icon} me-1`}></i>
        {' '}
        {btn.label}
      </button>
    ))}

    <div className="vr bg-light mx-1" style={{ opacity: 0.5, height: '24px' }}></div>

    <button
      type="button"
      onClick={onRecenter}
      className="btn btn-sm btn-outline-warning"
      title="Encuadrar la vista sobre el polígono inspeccionado"
    >
      <i className="bi bi-arrows-collapse me-1"></i>
      {' '}
      Centrar Polígono
    </button>

    {sentinelUrl && currentPlano === 1 && (
      <>
        <div className="vr bg-light mx-1" style={{ opacity: 0.5, height: '24px' }}></div>
        <button
          type="button"
          onClick={() => setUseSentinel(!useSentinel)}
          className={`btn btn-sm ${useSentinel ? 'btn-primary' : 'btn-outline-primary'}`}
        >
          <i className="bi bi-satellite me-1"></i>
          {' '}
          {useSentinel ? 'Sentinel-2 (Temporal)' : 'ESRI (Alta Res)'}
        </button>
      </>
    )}
  </div>
);

function useMapImageExport(
  printRef: React.RefObject<HTMLDivElement | null>,
  mapRef: L.Map | null,
  currentPlano: number,
  expediente?: string,
) {
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleDownloadImage = useCallback(() => {
    const node = printRef.current;
    if (!node) return;

    setIsExporting(true);
    window.scrollTo(0, 0);

    if (mapRef) {
      mapRef.setView(mapRef.getCenter(), mapRef.getZoom(), { animate: false });
    }

    const EXPORT_SCALE = 3;
    const baseWidth = node.offsetWidth || 1132;
    const baseHeight = node.offsetHeight || 816;

    setTimeout(() => {
      domtoimage
        .toPng(node, {
          bgcolor: '#ffffff',
          width: baseWidth * EXPORT_SCALE,
          height: baseHeight * EXPORT_SCALE,
          style: {
            margin: '0',
            width: `${baseWidth}px`,
            height: `${baseHeight}px`,
            transform: `scale(${EXPORT_SCALE})`,
            transformOrigin: 'top left',
          },
          filter: (domNode: Node) => {
            if (domNode instanceof HTMLElement) {
              return (
                !domNode.classList.contains('ignore-print') &&
                !domNode.classList.contains('leaflet-control-container')
              );
            }
            return true;
          },
        })
        .then((dataUrl) => {
          const link = document.createElement('a');
          const planoName = PLANO_FILE_NAMES[currentPlano] ?? 'Ubicacion_Geografica';
          link.download = `Mapa_Oficial_${expediente || 'Dictamen'}_${planoName}.png`;
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
  }, [printRef, mapRef, currentPlano, expediente]);

  return { isExporting, handleDownloadImage };
}

export const GeoViewer: React.FC = () => {
  const { register, handleSubmit } = useForm<FormData>();
  const [mapCenter] = useState<[number, number]>([19.4326, -99.1332]);
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [microcuencaData, setMicrocuencaData] = useState<FeatureCollection | null>(null);
  const [previewData, setPreviewData] = useState<FormData | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentPlano, setCurrentPlano] = useState<number>(1);
  const [activatedPlanos, setActivatedPlanos] = useState<Record<number, boolean>>({ 1: true });
  const [layerFilterMode, setLayerFilterMode] = useState<LayerFilterMode>('buffer10km');
  const [frameData, setFrameData] = useState<FrameData | null>(null);
  const [mapRef, setMapRef] = useState<L.Map | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [selectedVegSerie, setSelectedVegSerie] = useState<string>('serie_7');
  const [currentViewportBbox, setCurrentViewportBbox] = useState<[number, number, number, number] | null>(null);

  // Estados para Plano 7: Análisis Espacio-Temporal Anual
  const [temporalYear, setTemporalYear] = useState<number>(2018);
  const [temporalCollection, setTemporalCollection] = useState<SatelliteCollectionOption>('sentinel-2-l2a');
  const [temporalPreset, setTemporalPreset] = useState<SpectralPreset>('rgb');

  const { isExporting, handleDownloadImage } = useMapImageExport(
    printRef,
    mapRef,
    currentPlano,
    previewData?.expediente,
  );

  const handleSelectPlano = useCallback((plano: number) => {
    setCurrentPlano(plano);
    setActivatedPlanos((prev) => (prev[plano] ? prev : { ...prev, [plano]: true }));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setFrameData((e as CustomEvent<FrameData>).detail);
    document.addEventListener('mapFrameUpdated', handler);
    return () => document.removeEventListener('mapFrameUpdated', handler);
  }, []);

  const userPolygonGeom = useMemo<Feature<Polygon | MultiPolygon> | null>(() => {
    if (!geoJsonData || geoJsonData.features.length === 0) return null;
    try {
      const polys = geoJsonData.features.filter(
        (f): f is Feature<Polygon | MultiPolygon> =>
          f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
      );
      if (polys.length === 1) return polys[0];
      if (polys.length > 1) {
        const coords = polys.flatMap((feat) =>
          feat.geometry.type === 'Polygon'
            ? [feat.geometry.coordinates]
            : feat.geometry.coordinates
        );
        return turf.multiPolygon(coords);
      }
      const tinyBuffer = turf.buffer(geoJsonData, 0.001, { units: 'kilometers' });
      return tinyBuffer?.features[0] ?? null;
    } catch {
      return null;
    }
  }, [geoJsonData]);

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

  const { sentinelUrl, sentinelMetadata, useSentinel, setUseSentinel } = useSentinelData(
    predioCentroid,
    previewData?.targetDate
  );

  const {
    activeScene: activeTemporalScene,
    isLoadingTemporal,
    temporalError,
  } = useTemporalImagery(predioCentroid, Boolean(activatedPlanos[7]), {
    year: temporalYear,
    collection: temporalCollection,
    preset: temporalPreset,
  });

  const { ecoNearby, isLoadingEco } = useEcoLayers(
    activatedPlanos[2] ? userPolygonGeom : null,
    layerFilterMode,
  );
  const { vegNearby, isLoadingVeg } = useVegetationLayers(
    activatedPlanos[3] ? userPolygonGeom : null,
    layerFilterMode,
    selectedVegSerie,
  );
  const { climateNearby, isLoadingClimate } = useClimateLayers(
    activatedPlanos[4] ? userPolygonGeom : null,
    layerFilterMode,
  );
  const { edafologiaNearby, isLoadingEdafologia } = useEdafologiaLayers(
    activatedPlanos[5] ? userPolygonGeom : null,
    layerFilterMode,
  );
  const {
    cuencasNearby,
    subcuencasNearby,
    cuerposAguaNearby,
    corrientesNearby,
    isLoadingHidrologia,
  } = useHidrologiaLayers(
    activatedPlanos[6] ? userPolygonGeom : null,
    layerFilterMode,
  );

  // Filtrar en el minimapa únicamente las capas visibles dentro del encuadre completo del mapa
  const miniVisibleLayers = useMemo(() => {
    let viewportPoly: Feature<Polygon> | null = null;

    if (currentViewportBbox) {
      try {
        viewportPoly = turf.bboxPolygon(currentViewportBbox);
      } catch {
        viewportPoly = null;
      }
    }

    const inView = (f: TypedMapFeature): boolean => {
      if (!f?.geometry) return false;
      if (!viewportPoly) return true;
      try {
        return turf.booleanIntersects(f, viewportPoly);
      } catch {
        return false;
      }
    };

    const eco = ecoNearby.filter((f) => Boolean(f.properties?._layerId) && inView(f));
    const veg = vegNearby.filter(
      (f) => Boolean(f.properties?._type && f.properties?._color) && inView(f)
    );
    const climate = climateNearby.filter(
      (f) => Boolean(f.properties?._type && f.properties?._color) && inView(f)
    );
    const edafologia = edafologiaNearby.filter(
      (f) => Boolean(f.properties?._type && f.properties?._color) && inView(f)
    );

    const cuencas = cuencasNearby.filter(inView);
    const subcuencas = subcuencasNearby.filter(inView);
    const cuerposAgua = cuerposAguaNearby.filter(inView);

    const visibleCorrientes = corrientesNearby.filter(inView);
    const visibleOrders = new Set<number>(
      visibleCorrientes.map((f) => getStrahlerOrderNumber(f.properties?.ORDER_1))
    );
    const corrientes =
      visibleOrders.size > 0
        ? visibleCorrientes.filter((f) =>
            visibleOrders.has(getStrahlerOrderNumber(f.properties?.ORDER_1))
          )
        : [];

    return {
      eco,
      veg,
      climate,
      edafologia,
      cuencas,
      subcuencas,
      cuerposAgua,
      corrientes,
    };
  }, [
    currentViewportBbox,
    ecoNearby,
    vegNearby,
    climateNearby,
    edafologiaNearby,
    cuencasNearby,
    subcuencasNearby,
    cuerposAguaNearby,
    corrientesNearby,
  ]);

  const onSubmit = async (data: FormData) => {
    const files = data.polygonFile;
    if (!files || files.length === 0) return;
    setPreviewData(data);

    try {
      const parsedPredio = await parseSpatialFilesWithFallback(files);

      const microFiles = data.microcuencaFile;
      if (microFiles && microFiles.length > 0) {
        const parsedMicro = await parseSpatialFilesWithFallback(microFiles);
        setMicrocuencaData(parsedMicro);
      } else {
        setMicrocuencaData(null);
      }

      setGeoJsonData(parsedPredio);
      setActivatedPlanos({ [currentPlano]: true });
      setIsSidebarOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error procesando el archivo espacial.';
      console.warn('Error procesando el archivo espacial:', err);
      alert(msg);
    }
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

  const nombreActual = NOMBRES_PLANOS[currentPlano - 1];
  const isAnyLayerLoading =
    isLoadingEco ||
    isLoadingVeg ||
    isLoadingClimate ||
    isLoadingEdafologia ||
    isLoadingHidrologia ||
    isLoadingTemporal;

  return (
    <div className="container-fluid my-4 px-2 d-flex flex-column position-relative shadow-sm rounded border" style={{ minHeight: '850px', backgroundColor: '#f8f9fa', zIndex: 1, isolation: 'isolate' }}>
      <div className="d-flex flex-grow-1 position-relative overflow-hidden w-100 rounded">

        <SidebarFormPanel
          isSidebarOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          register={register}
          handleSubmit={handleSubmit}
          onSubmit={onSubmit}
        />

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

          <div style={{ marginTop: '40px', marginBottom: '20px', maxWidth: '100%', overflowX: 'auto' }}>
            <div
              ref={printRef}
              className="bg-white position-relative d-flex align-items-start"
              style={{
                padding: previewData ? '40px 30px 40px 40px' : '40px',
                boxSizing: 'border-box',
                width: previewData ? '1132px' : '816px',
                height: '816px',
              }}
            >
              {/* COLUMNA IZQUIERDA: MAPA CUADRADO ORIGINAL (736px x 736px) */}
              <div
                className="position-relative"
                style={{
                  width: '736px',
                  height: '736px',
                  flexShrink: 0,
                  border: '2px solid black',
                }}
              >
                <CoordinateLabels frameData={frameData} />
                <ZebraFrame frameData={frameData} />

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
                      <span className="small fw-semibold text-dark">
                        {isLoadingTemporal ? 'Consultando Google Earth Engine...' : 'Consultando coberturas SIG...'}
                      </span>
                    </output>
                  )}

                  <MapContainer
                    ref={setMapRef}
                    center={mapCenter}
                    zoom={6}
                    maxZoom={18}
                    zoomControl={false}
                    scrollWheelZoom="center"
                    doubleClickZoom="center"
                    preferCanvas={true}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <ViewportWatcher onBoundsChange={setCurrentViewportBbox} />

                    {/* CRÍTICO: isExporting no está en las dependencias. Esto evita que el canvas se limpie antes de capturar */}
                    <InvalidateMap
                      dependencies={[
                        geoJsonData,
                        useSentinel,
                        isSidebarOpen,
                        selectedVegSerie,
                        layerFilterMode,
                        currentPlano,
                        activeTemporalScene?.tileUrl,
                      ]}
                    />

                    <BaseSatelliteTileLayer
                      currentPlano={currentPlano}
                      activeTemporalScene={activeTemporalScene}
                      useSentinel={useSentinel}
                      sentinelUrl={sentinelUrl}
                    />

                    <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={18} maxZoom={18} />

                    <GraticuleEngine />
                    <MapUpdater
                      data={geoJsonData}
                      plano={currentPlano}
                      filterMode={layerFilterMode}
                      trigger={recenterTrigger}
                    />
                    <ZoomCenterOnPolygon data={geoJsonData} />

                    <div className="ignore-print" style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 1000, backgroundColor: 'rgba(255,255,255,0.7)', padding: '2px 5px', pointerEvents: 'none' }}>
                      <ScaleControl position="bottomleft" imperial={false} />
                    </div>

                    {currentPlano === 2 && <EcoLayer key={`eco-${currentPlano}-${layerFilterMode}`} ecoNearby={ecoNearby} />}
                    {currentPlano === 3 && <VegLayer key={`veg-${currentPlano}-${selectedVegSerie}-${layerFilterMode}`} vegNearby={vegNearby} />}
                    {currentPlano === 4 && <ClimateLayer key={`climate-${currentPlano}-${layerFilterMode}`} climateNearby={climateNearby} />}
                    {currentPlano === 5 && <EdafologiaLayer key={`edafologia-${currentPlano}-${layerFilterMode}`} edafologiaNearby={edafologiaNearby} />}
                    {currentPlano === 6 && (
                      <HidrologiaLayer
                        key={`hidrologia-${currentPlano}-${layerFilterMode}`}
                        cuencasNearby={cuencasNearby}
                        subcuencasNearby={subcuencasNearby}
                        cuerposAguaNearby={cuerposAguaNearby}
                        corrientesNearby={corrientesNearby}
                        microcuencaData={microcuencaData}
                      />
                    )}

                    {geoJsonData && <UserPolygonLayer key={`user-layer-${currentPlano}`} geoJsonData={geoJsonData} />}
                    {(currentPlano === 1 || currentPlano === 7) && <SmartLabels data={geoJsonData} plano={currentPlano} />}

                  </MapContainer>
                </div>
              </div>

              {/* COLUMNA DERECHA: SIMBOLOGÍA Y MARGINALIA EXTENDIDA HACIA LA DERECHA */}
              {previewData && (
                <div
                  className="bg-white d-flex flex-column"
                  style={{
                    width: '290px',
                    flexShrink: 0,
                    maxHeight: '736px',
                    marginLeft: '36px',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  {/* ENCABEZADO INSTITUCIONAL */}
                  <div className="d-flex align-items-center mb-2">
                    <img
                      src={profepaLogo}
                      alt="PROFEPA"
                      className="me-2"
                      style={{ height: '38px', width: 'auto', flexShrink: 0 }}
                    />
                    <div className="d-flex flex-column text-center flex-grow-1">
                      <h6
                        className="fw-bold mb-1"
                        style={{ fontSize: '0.68rem', lineHeight: '1.15', color: '#000' }}
                      >
                        PROCURADURÍA FEDERAL DE PROTECCIÓN AL AMBIENTE
                      </h6>
                      <span
                        className="text-muted"
                        style={{ fontSize: '0.58rem', lineHeight: '1.1' }}
                      >
                        Subprocuraduría de Recursos Naturales
                      </span>
                    </div>
                  </div>

                  {/* MINIMAPA DE LOCALIZACIÓN */}
                  <MiniMapLocator
                    data={geoJsonData}
                    buffer10km={buffer10km}
                    currentPlano={currentPlano}
                    selectedVegSerie={selectedVegSerie}
                    ecoNearby={miniVisibleLayers.eco}
                    vegNearby={miniVisibleLayers.veg}
                    climateNearby={miniVisibleLayers.climate}
                    edafologiaNearby={miniVisibleLayers.edafologia}
                    cuencasNearby={miniVisibleLayers.cuencas}
                    subcuencasNearby={miniVisibleLayers.subcuencas}
                    cuerposAguaNearby={miniVisibleLayers.cuerposAgua}
                    corrientesNearby={miniVisibleLayers.corrientes}
                    microcuencaData={microcuencaData}
                    estado={previewData.estado}
                    municipio={previewData.municipio}
                  />

                  {/* LEYENDA DINÁMICA POR PLANO */}
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
                  {currentPlano === 6 && (
                    <LegendHidrologia
                      cuencasNearby={cuencasNearby}
                      subcuencasNearby={subcuencasNearby}
                      corrientesNearby={corrientesNearby}
                      cuerposAguaNearby={cuerposAguaNearby}
                      hasMicrocuenca={Boolean(microcuencaData?.features?.length)}
                      isLoading={isLoadingHidrologia}
                      targetDate={previewData.targetDate}
                      currentViewportBbox={currentViewportBbox}
                    />
                  )}
                  {currentPlano === 7 && (
                    <LegendEspacioTemporal
                      targetDate={previewData.targetDate}
                      activeScene={activeTemporalScene}
                      preset={temporalPreset}
                      areaDetails={areaDetails}
                      totalArea={totalArea}
                    />
                  )}

                  {/* SISTEMA DE REFERENCIA */}
                  <div className="bg-white border border-dark">
                    <div className="fw-bold text-white text-center" style={{ backgroundColor: '#163f37', fontSize: '0.70rem', padding: '2px' }}>
                      Sistema de Referencia:
                    </div>
                    <p className="mb-0 text-center p-1" style={{ fontSize: '0.62rem', lineHeight: '1.15' }}>
                      DATUM WGS84 Zona 14 N<br />Proyección Transversal de Mercator
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {geoJsonData && (
            <div
              className="w-100 d-flex flex-column align-items-center gap-2 ignore-print mb-4"
              style={{ maxWidth: '1132px' }}
            >
              {currentPlano >= 2 && currentPlano <= 6 && (
                <LayerFilterBar
                  layerFilterMode={layerFilterMode}
                  setLayerFilterMode={setLayerFilterMode}
                />
              )}

              {currentPlano === 7 && (
                <TemporalControlPanel
                  temporalYear={temporalYear}
                  setTemporalYear={setTemporalYear}
                  temporalCollection={temporalCollection}
                  setTemporalCollection={setTemporalCollection}
                  temporalPreset={temporalPreset}
                  setTemporalPreset={setTemporalPreset}
                  activeScene={activeTemporalScene}
                  isLoadingTemporal={isLoadingTemporal}
                  temporalError={temporalError}
                />
              )}

              <PlanosNavBar
                currentPlano={currentPlano}
                onSelectPlano={handleSelectPlano}
                onRecenter={() => setRecenterTrigger((prev) => prev + 1)}
                sentinelUrl={sentinelUrl}
                useSentinel={useSentinel}
                setUseSentinel={setUseSentinel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};