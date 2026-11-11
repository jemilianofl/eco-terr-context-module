import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ScaleControl, CircleMarker, useMapEvents, Polyline, Tooltip } from 'react-leaflet';
import { useForm } from 'react-hook-form';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type { FeatureCollection, Feature, Geometry, GeoJsonObject, GeoJsonProperties } from 'geojson';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import * as turf from '@turf/turf';
import profepaLogo from '../../assets/img/LOGO_PROFEPA.png';

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
  xTicks: { lon: number; x: number }[];
  yTicks: { lat: number; y: number }[];
}

interface EcoLayerItem {
  id: string;
  title: string;
  color: string;
  data: FeatureCollection | null;
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

const featureStyle = (feature?: Feature<Geometry, GeoJsonProperties>) => {
  if (!feature) return {};
  return { color: '#ff0000', weight: 2.5, fillColor: '#ff0000', fillOpacity: 0 };
};

const pointToLayer = (_feature: Feature<Geometry, GeoJsonProperties>, latlng: L.LatLng) => {
  return L.circleMarker(latlng, { radius: 5, fillColor: '#ff0000', color: '#ffffff', weight: 1.5, opacity: 1, fillOpacity: 1, pane: 'markerPane' });
};

const getColorForVegetation = (str: string) => {
  const colors = [
    '#a3e635', '#4ade80', '#fbbf24', '#f87171', '#60a5fa', '#c084fc', 
    '#f472b6', '#fb923c', '#38bdf8', '#34d399', '#a78bfa', '#fbb6ce', 
    '#86efac', '#fde047', '#14b8a6', '#f43f5e', '#8b5cf6', '#d946ef'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const ViewportWatcher: React.FC<{ onBoundsChange: (bbox: [number, number, number, number]) => void }> = ({ onBoundsChange }) => {
  const map = useMap();

  const updateBounds = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }, [map, onBoundsChange]);

  useMapEvents({
    moveend: updateBounds,
    zoomend: updateBounds,
  });

  useEffect(() => {
    updateBounds();
  }, [updateBounds]);

  return null;
};

const GraticuleEngine: React.FC = () => {
  const map = useMap();
  const [grid, setGrid] = useState<{ lats: number[]; lons: number[]; bounds: L.LatLngBounds | null }>({ lats: [], lons: [], bounds: null });

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

    const xTicks = lons.map((lon) => ({ lon, x: map.latLngToContainerPoint([b.getSouth(), lon]).x }));
    const yTicks = lats.map((lat) => ({ lat, y: map.latLngToContainerPoint([lat, b.getWest()]).y }));

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

const MapUpdater: React.FC<{
  data: FeatureCollection | null;
  plano: number;
  buffer10km: Feature<Geometry, GeoJsonProperties> | null;
}> = ({ data, plano, buffer10km }) => {
  const map = useMap();

  useEffect(() => {
    if (!data || data.features.length === 0) return;
    const paddingOpts = { paddingBottomRight: [330, 30] as [number, number], paddingTopLeft: [40, 40] as [number, number] };

    if (plano === 1) {
      const layer = L.geoJSON(data as GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { ...paddingOpts, maxZoom: 18 });
    } else if (plano === 2 || plano === 3) {
      if (buffer10km) {
        const bbox = turf.bbox(buffer10km);
        map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], paddingOpts);
      }
    }
  }, [data, plano, buffer10km, map]);

  return null;
};

const InvalidateMap: React.FC<{ dependencies: any[] }> = ({ dependencies }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => { 
      map.invalidateSize(true); 
    }, 400);
    return () => clearTimeout(timer);
  }, [map, ...dependencies]);
  return null;
};

const MiniMapLocator: React.FC<{ data: FeatureCollection | null; estado: string; municipio: string }> = ({ data, estado, municipio }) => {
  if (!data || data.features.length === 0) return null;
  const center = L.geoJSON(data as GeoJsonObject).getBounds().getCenter();

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
        if (f.geometry.type === 'Point') return null;
        const polyId = f.properties?.polyId;
        if (!polyId) return null;

        try {
          const centroid = turf.centroid(f);
          const [lon, lat] = centroid.geometry.coordinates;
          
          const angles = [45, 135, 315, 225, 0, 180, 90, 270];
          const angleDeg = angles[i % angles.length];
          const angleRad = angleDeg * (Math.PI / 180);
          
          const baseDist = 0.00025; 
          const multiplier = 1 + Math.floor(i / 8) * 0.3;
          const offsetDist = baseDist * multiplier;

          const labelLat = lat + Math.sin(angleRad) * offsetDist;
          const labelLon = lon + Math.cos(angleRad) * offsetDist;

          return (
            <CircleMarker key={`smart-label-${polyId}`} center={[labelLat, labelLon]} radius={0} opacity={0} pane="markerPane">
              <Tooltip 
                permanent 
                direction="center" 
                className="bg-transparent border-0 shadow-none p-0"
              >
                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#ff0000', textShadow: '-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff' }}>
                  {polyId}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        } catch {
          return null;
        }
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
  const printRef = useRef<HTMLDivElement>(null);
  
  const [sentinelUrl, setSentinelUrl] = useState<string | null>(null);
  const [sentinelMetadata, setSentinelMetadata] = useState<any>(null);
  const [useSentinel, setUseSentinel] = useState<boolean>(true);

  const [selectedVegSerie, setSelectedVegSerie] = useState<string>('serie_7');
  const [vegLayerData, setVegLayerData] = useState<FeatureCollection | null>(null);
  const [currentViewportBbox, setCurrentViewportBbox] = useState<[number, number, number, number] | null>(null);

  const vegSeriesOptions = [
    { id: 'serie_1', label: 'Serie I' },
    { id: 'serie_2', label: 'Serie II' },
    { id: 'serie_3', label: 'Serie III' },
    { id: 'serie_4', label: 'Serie IV' },
    { id: 'serie_5', label: 'Serie V' },
    { id: 'serie_6', label: 'Serie VI' },
    { id: 'serie_7', label: 'Serie VII' },
  ];

  const [ecoLayers, setEcoLayers] = useState<EcoLayerItem[]>([
    { id: 'aicas', title: 'Área de Importancia para la Conservación de las Aves (AICA)', color: '#d63384', data: null },
    { id: 'ramsar', title: 'Sitio Ramsar', color: '#0d6efd', data: null },
    { id: 'anp_federal', title: 'Área Natural Protegida federal', color: '#198754', data: null },
    { id: 'anp_estatal', title: 'Área Natural Protegida estatal o municipal', color: '#fd7e14', data: null },
    { id: 'advc', title: 'Área Destinada Voluntariamente a la Conservación (ADVC)', color: '#65a30d', data: null },
    { id: 'rtp', title: 'Región Terrestre Prioritaria', color: '#ffc107', data: null },
    { id: 'rhp', title: 'Región Hídrica Prioritaria', color: '#0dcaf0', data: null },
  ]);

  useEffect(() => {
    const handler = (e: Event) => setFrameData((e as CustomEvent<FrameData>).detail);
    document.addEventListener('mapFrameUpdated', handler);
    return () => document.removeEventListener('mapFrameUpdated', handler);
  }, []);

  useEffect(() => {
    if (currentPlano === 2) {
      ecoLayers.forEach((layer) => {
        if (!layer.data) {
          fetch(`/layers/geojson/${layer.id}.geojson`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json: FeatureCollection | null) => {
              if (json) {
                setEcoLayers((prev) => prev.map((l) => (l.id === layer.id ? { ...l, data: json } : l)));
              }
            })
            .catch((err) => console.warn(`Capa ${layer.id} no disponible.`, err));
        }
      });
    }
  }, [currentPlano, ecoLayers]);

  useEffect(() => {
    if (currentPlano === 3) {
      setVegLayerData(null);
      fetch(`/layers/geojson/usv_${selectedVegSerie}.geojson`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json: FeatureCollection | null) => {
          if (json) setVegLayerData(json);
        })
        .catch((err) => console.warn(`Capa de vegetación ${selectedVegSerie} no disponible.`, err));
    }
  }, [currentPlano, selectedVegSerie]);

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
          finalF.properties.polyId = String.fromCharCode(65 + polyIndex);
          polyIndex++;
        }
        return finalF;
      });

      setGeoJsonData({ type: 'FeatureCollection', features: cleanFeatures } as FeatureCollection);
      setIsSidebarOpen(false);
    } catch (err) {
      console.warn('Error procesando el archivo espacial:', err);
      alert('Error procesando el archivo espacial.');
    }
  };

  const buffer10km = useMemo(() => {
    if (!geoJsonData || geoJsonData.features.length === 0) return null;
    try {
      const polys = turf.featureCollection(geoJsonData.features.filter((f) => f.geometry.type !== 'Point'));
      return turf.buffer(polys, 10, { units: 'kilometers' }) as Feature<Geometry, GeoJsonProperties>;
    } catch (err) {
      console.warn('Error calculando buffer:', err);
      return null;
    }
  }, [geoJsonData]);

  const predioCentroid = useMemo(() => {
    if (!geoJsonData || geoJsonData.features.length === 0) return null;
    try {
      return turf.centroid(geoJsonData);
    } catch {
      return null;
    }
  }, [geoJsonData]);

  useEffect(() => {
    if (!predioCentroid || !previewData?.targetDate) return;

    const fetchSentinelData = async () => {
      try {
        const [lng, lat] = predioCentroid.geometry.coordinates;
        const backendUrl = import.meta.env.VITE_SENTINEL_API_URL || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/sentinel/tiles?lat=${lat}&lng=${lng}&date=${previewData.targetDate}`);
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.tileUrl) {
            setSentinelUrl(result.tileUrl);
            setSentinelMetadata(result.metadata);
            setUseSentinel(true);
          }
        } else {
          setSentinelUrl(null);
          setSentinelMetadata(null);
          setUseSentinel(false);
        }
      } catch (error) {
        setSentinelUrl(null);
        setSentinelMetadata(null);
        setUseSentinel(false);
      }
    };

    fetchSentinelData();
  }, [predioCentroid, previewData?.targetDate]);

  const ecoNearby = useMemo(() => {
    if (!buffer10km || currentPlano !== 2) return [];
    const nearby: Feature<Geometry, GeoJsonProperties>[] = [];

    ecoLayers.forEach((layer) => {
      if (!layer.data) return;
      layer.data.features.forEach((f) => {
        try {
          if (turf.booleanIntersects(f as turf.CoordPair, buffer10km as turf.CoordPair)) {
            nearby.push({
              ...f,
              properties: {
                ...f.properties,
                _color: layer.color,
                _title: layer.title,
                _layerId: layer.id,
              },
            });
          }
        } catch {
          // ignora fallos
        }
      });
    });

    return nearby;
  }, [buffer10km, currentPlano, ecoLayers]);

  // Se cargan en el mapa los polígonos que intersecten el buffer base de 10km
  const vegNearby = useMemo(() => {
    if (!buffer10km || currentPlano !== 3 || !vegLayerData) return [];
    const nearby: Feature<Geometry, GeoJsonProperties>[] = [];

    vegLayerData.features.forEach((f) => {
      try {
        if (turf.booleanIntersects(f as turf.CoordPair, buffer10km as turf.CoordPair)) {
          const props = f.properties || {};
          const typeVeg = props.DESCRIPCIO || props.TIPO_VEG || props.TIPO || props.DESC || props.NOMBRE || 'Vegetación Indeterminada';
          nearby.push({
            ...f,
            properties: {
              ...props,
              _type: typeVeg,
              _color: getColorForVegetation(typeVeg)
            }
          });
        }
      } catch {
        // ignora fallos
      }
    });

    return nearby;
  }, [buffer10km, currentPlano, vegLayerData]);

  const activeEcoLegend = useMemo(() => {
    if (currentPlano !== 2 || ecoNearby.length === 0) return [];
    const foundIds = new Set(ecoNearby.map(f => f.properties?._layerId));
    return ecoLayers.filter(layer => foundIds.has(layer.id));
  }, [ecoNearby, currentPlano, ecoLayers]);

  // FILTRADO DINÁMICO DE SIMBOLOGÍA: Filtra exclusivamente los tipos de vegetación dentro del encuadre visible (viewport)
  const activeVegLegend = useMemo(() => {
    if (currentPlano !== 3 || vegNearby.length === 0) return [];

    let viewportPolygon: Feature<Geometry, GeoJsonProperties> | null = null;
    if (currentViewportBbox) {
      try {
        viewportPolygon = turf.bboxPolygon(currentViewportBbox);
      } catch {
        viewportPolygon = null;
      }
    }

    const uniqueTypes = new Map<string, string>();

    vegNearby.forEach(f => {
      let isVisible = true;
      if (viewportPolygon) {
        try {
          isVisible = turf.booleanIntersects(f as turf.CoordPair, viewportPolygon as turf.CoordPair);
        } catch {
          isVisible = false;
        }
      }

      if (isVisible) {
        const typeStr = f.properties?._type;
        if (typeStr && !uniqueTypes.has(typeStr)) {
          uniqueTypes.set(typeStr, f.properties?._color);
        }
      }
    });

    return Array.from(uniqueTypes.entries()).map(([label, color]) => ({ label, color }));
  }, [vegNearby, currentPlano, currentViewportBbox]);

  const onEachUserFeature = useCallback(
    (feature: Feature<Geometry, GeoJsonProperties>, layer: L.Layer) => {
      if (feature.properties && feature.geometry.type !== 'Point') {
        const polyId = feature.properties.polyId || '';
        
        let areaHtml = '';
        try {
          const areaSqMeters = turf.area(feature);
          areaHtml = `<strong>Superficie calculada:</strong> ${areaSqMeters.toFixed(2)} m²<br/>`;
        } catch (e) {
          console.warn('Error calculando área:', e);
        }

        let propsHtml = '';
        Object.entries(feature.properties).forEach(([key, val]) => {
          if (key !== 'polyId' && key !== 'style' && val !== null && val !== undefined && val !== '') {
            propsHtml += `<strong>${key}:</strong> ${val}<br/>`;
          }
        });

        layer.bindPopup(
          `<div style="font-size:0.85rem; min-width: 200px; max-height: 250px; overflow-y: auto;">
            <strong style="color:#d63384; font-size:1rem;">Datos del Polígono ${polyId}</strong><br/>
            <div style="border-top:1px solid #ccc; margin: 4px 0;"></div>
            ${areaHtml}
            ${propsHtml}
          </div>`
        );
      }
    },
    []
  );

  const onEachVegFeature = useCallback(
    (feature: Feature<Geometry, GeoJsonProperties>, layer: L.Layer) => {
      if (feature.properties) {
        const p = feature.properties;
        const desc = p._type;
        const cve = p.CVE_VEG || p.CLAVE || '';
        
        layer.bindPopup(
          `<div style="font-size:0.85rem; min-width: 200px;">
            <strong style="color:#65a30d; font-size:0.95rem;">Información de Vegetación</strong><br/>
            <div style="border-top:1px solid #ccc; margin: 4px 0;"></div>
            <strong>Descripción:</strong> ${desc}<br/>
            ${cve ? `<strong>Clave:</strong> ${cve}<br/>` : ''}
          </div>`
        );
      }
    },
    []
  );

  const handleDownloadImage = () => {
    if (!printRef.current) return;
    setIsExporting(true);
    window.scrollTo(0, 0);

    setTimeout(async () => {
      try {
        const canvas = await html2canvas(printRef.current!, {
          useCORS: true,
          allowTaint: false,
          scale: 2,
          scrollY: 0,
          backgroundColor: '#ffffff',
          width: printRef.current?.scrollWidth,
          height: printRef.current?.scrollHeight,
          ignoreElements: (el) => el.classList.contains('ignore-print') || el.classList.contains('leaflet-popup'),
        });
        const link = document.createElement('a');
        let planoName = 'Ubicacion_Geografica';
        if (currentPlano === 2) planoName = 'Relevancia_Ecologica';
        if (currentPlano === 3) planoName = 'Tipo_Vegetacion';
        link.download = `Mapa_Oficial_${previewData?.expediente || 'Dictamen'}_${planoName}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
      } catch (err) {
        console.warn('Error al generar imagen:', err);
        alert('Error al generar la imagen.');
      } finally {
        setIsExporting(false);
      }
    }, 1000);
  };

  const { totalArea, areaDetails } = useMemo(() => {
    if (!geoJsonData) return { totalArea: '0.00', areaDetails: [] };
    let areaSum = 0;
    const details: { name: string; area: string }[] = [];

    geoJsonData.features.forEach((f) => {
      if (f.geometry.type === 'Point') return;
      const polyId = f.properties?.polyId;
      try {
        const a = turf.area(f);
        areaSum += a;
        if (polyId) details.push({ name: `Polígono ${polyId}`, area: a.toFixed(2) });
      } catch (err) {
        console.warn('Turf Error:', err);
      }
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

    const labelStyle: React.CSSProperties = {
      position: 'absolute',
      fontSize: '0.65rem',
      fontWeight: 'bold',
      color: 'black',
      whiteSpace: 'nowrap',
      zIndex: 10,
      textAlign: 'center',
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
    <div className="container-fluid my-4 px-2 d-flex flex-column position-relative shadow-sm rounded border" style={{ minHeight: '850px', backgroundColor: '#f8f9fa', zIndex: 1, isolation: 'isolate' }}>
      <div className="d-flex flex-grow-1 position-relative overflow-hidden w-100 rounded">
        
        {/* PANEL LATERAL */}
        <div className={`bg-white border-end shadow-sm overflow-auto transition-all ${isSidebarOpen ? 'd-block' : 'd-none'}`} style={{ zIndex: 1050, width: '320px', position: 'absolute', height: '100%', left: 0 }}>
          <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
            <h5 className="fw-bold mb-0" style={{ color: '#163f37' }}>Datos del Dictamen</h5>
            <button type="button" className="btn-close" onClick={() => setIsSidebarOpen(false)} aria-label="Close"></button>
          </div>
          <div className="p-3">
            <form onSubmit={handleSubmit(onSubmit)} className="d-flex flex-column gap-3">
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
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Generando...
                </>
              ) : (
                <>
                  <i className="bi bi-download me-2"></i>
                  Descargar {currentPlano === 1 ? 'Plano 1' : currentPlano === 2 ? 'Plano 2' : 'Plano 3'}
                </>
              )}
            </button>
          )}

          <div ref={printRef} className="bg-white position-relative d-flex align-items-center justify-content-center" style={{ padding: '40px', boxSizing: 'border-box', width: '11in', height: '8.5in', marginTop: '40px' }}>
            
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

                <MapContainer center={mapCenter} zoom={6} maxZoom={18} zoomControl={false} preferCanvas={true} style={{ height: '100%', width: '100%' }}>
                  
                  <ViewportWatcher onBoundsChange={setCurrentViewportBbox} />
                  <InvalidateMap dependencies={[geoJsonData, useSentinel, isSidebarOpen, selectedVegSerie]} />
                  
                  {useSentinel && sentinelUrl && currentPlano === 1 ? (
                    <TileLayer crossOrigin="anonymous" url={sentinelUrl} opacity={1} maxNativeZoom={15} maxZoom={18} />
                  ) : (
                    <TileLayer opacity={0.75} crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={18} maxZoom={18} />
                  )}
                  
                  <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={18} maxZoom={18} />

                  <GraticuleEngine />
                  <MapUpdater data={geoJsonData} plano={currentPlano} buffer10km={buffer10km} />

                  <div className="ignore-print" style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 1000, backgroundColor: 'rgba(255,255,255,0.7)', padding: '2px 5px', pointerEvents: 'none' }}>
                    <ScaleControl position="bottomleft" imperial={false} />
                  </div>

                  {geoJsonData && (
                    <GeoJSON key={`user-layer-${currentPlano}`} data={geoJsonData} style={featureStyle} pointToLayer={pointToLayer} onEachFeature={onEachUserFeature} />
                  )}

                  {currentPlano === 1 && <SmartLabels data={geoJsonData} plano={currentPlano} />}

                  {/* PLANO 2: CAPAS ECOLÓGICAS */}
                  {currentPlano === 2 && ecoNearby.length > 0 && (
                    <GeoJSON
                      key={`eco-layers-${ecoNearby.length}`}
                      data={turf.featureCollection(ecoNearby)}
                      style={(feature) => ({
                        color: feature?.properties?._color || '#198754',
                        weight: 2,
                        fillColor: feature?.properties?._color || '#198754',
                        fillOpacity: 0.25,
                      })}
                      onEachFeature={(feature, layer) => {
                        const p = feature.properties || {};
                        const title = p._title || 'Capa Ecológica';
                        const name = p.NOMBRE || p.NOM_AICA || p.nombre || p.Name || p.NAME || p.NOM || p.SITIO || 'Área Protegida';
                        const cat = p.CAT_MANEJO || p.CATEGORIA || p.TIPO || p.PRIORIDAD || p.TIPO_ZONA || '';
                        const estadoProp = p.ESTADOS || p.ESTADO || p.EDO || '';
                        const region = p.REGION || p.Region || '';
                        const sup = p.SUPERFICIE || p.HECTARES || p.AREA || '';

                        layer.bindPopup(
                          `<div style="font-size:0.85rem; min-width: 200px;">
                            <strong style="color:#163f37; font-size:0.9rem;">${title}</strong><br/>
                            <div style="border-top:1px solid #ccc; margin: 4px 0;"></div>
                            <strong>Nombre:</strong> ${name}<br/>
                            ${cat ? `<strong>Categoría:</strong> ${cat}<br/>` : ''}
                            ${estadoProp ? `<strong>Estado:</strong> ${estadoProp}<br/>` : ''}
                            ${region ? `<strong>Región:</strong> ${region}<br/>` : ''}
                            ${sup ? `<strong>Superficie:</strong> ${Number(sup).toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha` : ''}
                          </div>`
                        );
                      }}
                    />
                  )}

                  {/* PLANO 3: CAPAS DE VEGETACIÓN */}
                  {currentPlano === 3 && vegNearby.length > 0 && (
                    <GeoJSON
                      key={`veg-layers-${selectedVegSerie}-${vegNearby.length}`}
                      data={turf.featureCollection(vegNearby)}
                      style={(feature) => ({
                        color: feature?.properties?._color || '#65a30d',
                        weight: 1.5,
                        fillColor: feature?.properties?._color || '#84cc16',
                        fillOpacity: 0.35,
                      })}
                      onEachFeature={onEachVegFeature}
                    />
                  )}
                </MapContainer>

                {/* LEYENDA DERECHA */}
                {previewData && (
                  <div className="position-absolute bg-white p-3 shadow-sm" style={{ top: '15px', right: '15px', width: '290px', zIndex: 1000, border: '1px solid #000' }}>
                    <div className="text-center mb-3 d-flex flex-column align-items-center">
                      <img src={profepaLogo} alt="PROFEPA" style={{ height: '35px', marginBottom: '8px' }} />
                      <h6 className="fw-bold mb-0" style={{ fontSize: '0.75rem', color: '#000' }}>PROCURADURÍA FEDERAL DE PROTECCIÓN AL AMBIENTE</h6>
                      <span className="text-muted" style={{ fontSize: '0.6rem' }}>Subprocuraduría de Recursos Naturales</span>
                    </div>

                    <MiniMapLocator data={geoJsonData} estado={previewData.estado} municipio={previewData.municipio} />

                    {/* VISTA PLANO 1 */}
                    {currentPlano === 1 && (
                      <>
                        <div className="bg-white mb-2 border border-dark">
                          <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Datos de Inspección</div>
                          <div className="p-2 text-center" style={{ fontSize: '0.65rem' }}>
                            <p className="mb-1"><strong>Acta:</strong> {previewData.acta || 'N/A'}</p>
                            <p className="mb-0"><strong>Fecha de Inspección:</strong> {previewData.targetDate || 'N/A'}</p>
                          </div>
                        </div>

                        {useSentinel && sentinelMetadata && (
                          <div className="bg-white mb-2 border border-dark">
                            <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#0d6efd', fontSize: '0.75rem', padding: '2px' }}>Metadatos Satelitales</div>
                            <div className="p-2 text-center" style={{ fontSize: '0.60rem' }}>
                              <p className="mb-1"><strong>Sensor:</strong> {sentinelMetadata.platform}</p>
                              <p className="mb-1"><strong>Captura:</strong> {new Date(sentinelMetadata.date).toLocaleDateString('es-MX')}</p>
                              <p className="mb-0"><strong>Nubosidad:</strong> {Number(sentinelMetadata.cloudCover).toFixed(2)}%</p>
                            </div>
                          </div>
                        )}

                        <div className="bg-white mb-2 border border-dark">
                          <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Simbología</div>
                          <div className="p-2">
                            <div className="d-flex align-items-center mb-1">
                              <div style={{ width: '12px', height: '12px', backgroundColor: 'transparent', border: '2px solid #ff0000', marginRight: '8px' }}></div>
                              <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono(s) Inspeccionado(s)</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white mb-2 border border-dark">
                          <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem', padding: '2px' }}>Datos de Superficie:</div>
                          <div className="p-2 text-center">
                            {areaDetails.map((item) => (
                              <p key={`area-${item.name}`} className="mb-1" style={{ fontSize: '0.65rem' }}><strong>{item.name}:</strong> {item.area} m²</p>
                            ))}
                            <div style={{ borderTop: '1px solid #ccc', margin: '4px 0' }}></div>
                            <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Superficie Total:</strong> {totalArea} m²</p>
                          </div>
                        </div>
                      </>
                    )}

                    {/* VISTA PLANO 2 */}
                    {currentPlano === 2 && (
                      <>
                        <div className="bg-white mb-2 border border-dark">
                          <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Simbología</div>
                          <div className="p-2">
                            <div className="d-flex align-items-center mb-2 border-bottom pb-2">
                              <div style={{ width: '12px', height: '12px', backgroundColor: 'transparent', border: '2px solid #ff0000', marginRight: '8px', flexShrink: 0 }}></div>
                              <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono Inspeccionado</span>
                            </div>
                            
                            {activeEcoLegend.length > 0 ? (
                              <>
                                <div className="fw-bold mb-1" style={{ fontSize: '0.65rem', color: '#163f37' }}>Relevancia ecológica intersectada:</div>
                                {activeEcoLegend.map((layer) => (
                                  <div key={`sym-eco-${layer.id}`} className="d-flex align-items-center mb-1">
                                    <div style={{ width: '12px', height: '12px', border: `2px solid ${layer.color}`, backgroundColor: `${layer.color}40`, marginRight: '8px', flexShrink: 0 }}></div>
                                    <span style={{ fontSize: '0.60rem', lineHeight: '1.1' }}>{layer.title}</span>
                                  </div>
                                ))}
                              </>
                            ) : (
                              <div className="text-center text-muted mt-2" style={{ fontSize: '0.65rem' }}>Ningún polígono ecológico dentro de los 10 km</div>
                            )}
                          </div>
                        </div>
                        
                        <div className="border border-dark mt-2 p-1 text-center" style={{ fontSize: '0.65rem' }}>
                          <span className="fw-bold">Fecha de Inspección:</span> {previewData.targetDate || 'N/A'}
                        </div>
                      </>
                    )}

                    {/* VISTA PLANO 3 */}
                    {currentPlano === 3 && (
                      <>
                        <div className="bg-white mb-2 border border-dark">
                          <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#65a30d', fontSize: '0.75rem', padding: '2px' }}>Datos de Vegetación</div>
                          <div className="p-2">
                            <label className="fw-bold mb-1" style={{ fontSize: '0.65rem' }}>Serie INEGI a evaluar:</label>
                            <select
                              className="form-select form-select-sm ignore-print"
                              style={{ fontSize: '0.7rem' }}
                              value={selectedVegSerie}
                              onChange={(e) => setSelectedVegSerie(e.target.value)}
                            >
                              {vegSeriesOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                            </select>
                            
                            <div className="d-print-block d-none" style={{ fontSize: '0.7rem' }}>
                              Serie Seleccionada: <strong>{vegSeriesOptions.find(o => o.id === selectedVegSerie)?.label}</strong>
                            </div>
                          </div>
                          
                          <div className="p-2 border-top border-dark" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            <div className="fw-bold mb-2" style={{ fontSize: '0.65rem' }}>Simbología Visible en Encuadre</div>
                            <div className="d-flex align-items-center mb-2 border-bottom pb-2">
                              <div style={{ width: '12px', height: '12px', backgroundColor: 'transparent', border: '2px solid #ff0000', marginRight: '8px', flexShrink: 0 }}></div>
                              <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>Polígono Inspeccionado</span>
                            </div>
                            
                            {activeVegLegend.length > 0 ? (
                              activeVegLegend.map((item, idx) => (
                                <div key={`sym-veg-${idx}`} className="d-flex align-items-center mt-1">
                                  <div style={{ width: '12px', height: '12px', border: `2px solid ${item.color}`, backgroundColor: `${item.color}80`, marginRight: '8px', flexShrink: 0 }}></div>
                                  <span style={{ fontSize: '0.60rem', lineHeight: '1.1' }}>{item.label}</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-center text-muted mt-2" style={{ fontSize: '0.65rem' }}>Sin coberturas visibles en este encuadre</div>
                            )}
                          </div>
                        </div>
                        
                        <div className="border border-dark mt-2 p-1 text-center" style={{ fontSize: '0.65rem' }}>
                          <span className="fw-bold">Fecha de Inspección:</span> {previewData.targetDate || 'N/A'}
                        </div>
                      </>
                    )}

                    <div className="bg-white mb-2 border border-dark mt-2">
                      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem', padding: '2px' }}>Sistema de Referencia:</div>
                      <p className="mb-0 text-center p-1" style={{ fontSize: '0.65rem' }}>DATUM WGS84 Zona 14 N<br />Proyección Transversal de Mercator</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TOOLBAR */}
          {geoJsonData && (
            <div className="bg-dark text-white p-3 d-flex justify-content-center align-items-center gap-2 ignore-print mb-4 shadow rounded w-100" style={{ maxWidth: '900px', borderTop: '4px solid #d6b56a', height: '60px' }}>
              <span className="fw-bold me-1" style={{ fontSize: '0.9rem' }}>Vistas:</span>
              <button
                type="button"
                onClick={() => setCurrentPlano(1)}
                className={`btn btn-sm ${currentPlano === 1 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}
              >
                <i className="bi bi-geo-alt me-1"></i> Ubicación Geográfica
              </button>
              <button
                type="button"
                onClick={() => setCurrentPlano(2)}
                className={`btn btn-sm ${currentPlano === 2 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}
              >
                <i className="bi bi-tree me-1"></i> Relevancia Ecológica
              </button>
              <button
                type="button"
                onClick={() => setCurrentPlano(3)}
                className={`btn btn-sm ${currentPlano === 3 ? 'btn-light fw-bold text-dark' : 'btn-outline-light'}`}
              >
                <i className="bi bi-flower1 me-1"></i> Tipo de Vegetación
              </button>
              
              {sentinelUrl && currentPlano === 1 && (
                <>
                  <div className="vr bg-light mx-1" style={{ opacity: 0.5, height: '24px' }}></div>
                  <button
                    type="button"
                    onClick={() => setUseSentinel(!useSentinel)}
                    className={`btn btn-sm ${useSentinel ? 'btn-primary' : 'btn-outline-primary'}`}
                    title="Alterna entre imagen satelital de la fecha exacta o imagen de alta resolución"
                  >
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