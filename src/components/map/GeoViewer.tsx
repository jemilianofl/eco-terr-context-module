import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ScaleControl, CircleMarker, useMapEvents, Polyline } from 'react-leaflet';
import { useForm } from 'react-hook-form';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type { FeatureCollection, Feature, Geometry, GeoJsonObject, GeoJsonProperties } from 'geojson';
import L from 'leaflet';
import html2canvas from 'html2canvas';

interface FormData {
  targetDate: string;
  polygonFile: FileList;
  expediente: string;
  acta: string;
  estado: string;
  municipio: string;
  vegetacion: string;
}

// COMPONENTE: Convertidor a Grados, Minutos y Segundos (Linter Fix: Sin ternarios anidados)
const toDMS = (deg: number, isLat: boolean) => {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);
  
  let direction = '';
  if (isLat) {
    direction = deg >= 0 ? 'N' : 'S';
  } else {
    direction = deg >= 0 ? 'E' : 'W';
  }
  return `${degrees}°${minutes}'${seconds}"${direction}`;
};

// COMPONENTE: Grilla, Marco Topográfico intercalado y Norte
const GraticuleAndFrame: React.FC = () => {
  const map = useMap();
  
  // Linter Fix: Inicialización perezosa de estado para no llamar setBounds en useEffect
  const [grid, setGrid] = useState<{lats: number[], lons: number[], bounds: L.LatLngBounds}>(() => ({
    lats: [], lons: [], bounds: map.getBounds()
  }));

  const updateGrid = () => {
    const b = map.getBounds();
    const zoom = map.getZoom();
    
    // Define la separación de la grilla dependiendo del nivel de zoom
    let step = 0.05;
    if (zoom > 16) step = 0.001;
    else if (zoom > 14) step = 0.005;
    else if (zoom > 12) step = 0.01;
    else if (zoom > 10) step = 0.05;
    else if (zoom > 8) step = 0.1;
    else step = 1;

    const lats = [];
    const startLat = Math.ceil(b.getSouth() / step) * step;
    for (let lat = startLat; lat <= b.getNorth(); lat += step) lats.push(lat);

    const lons = [];
    const startLon = Math.ceil(b.getWest() / step) * step;
    for (let lon = startLon; lon <= b.getEast(); lon += step) lons.push(lon);

    setGrid({ lats, lons, bounds: b });
  };

  useMapEvents({
    moveend: updateGrid,
    zoomend: updateGrid,
  });

  const labelStyle: React.CSSProperties = {
    position: 'absolute', backgroundColor: '#ffffff', padding: '1px 4px',
    fontSize: '0.65rem', fontWeight: 'bold', zIndex: 1000,
    border: '1px solid #000', pointerEvents: 'none',
    transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap'
  };

  const verticalLabelStyle: React.CSSProperties = {
    ...labelStyle,
    transform: 'translate(-50%, -50%) rotate(-90deg)'
  };

  return (
    <>
      {/* 1. Norte Magnético (Rosa de los Vientos) */}
      <div style={{ position: 'absolute', top: '25px', left: '25px', zIndex: 1000, pointerEvents: 'none' }}>
        <svg width="50" height="50" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <polygon points="50,0 60,40 50,50 40,40" fill="black" />
          <polygon points="50,100 60,60 50,50 40,60" fill="white" stroke="black" />
          <polygon points="100,50 60,60 50,50 60,40" fill="black" />
          <polygon points="0,50 40,60 50,50 40,40" fill="white" stroke="black" />
          <circle cx="50" cy="50" r="8" fill="white" stroke="black" />
          <text x="50" y="-5" fontSize="20" textAnchor="middle" fill="black" fontWeight="bold">N</text>
        </svg>
      </div>

      {/* 2. Líneas de Grilla sobre el mapa */}
      {grid.lats.map(lat => (
        <Polyline key={`lat-${lat}`} positions={[[lat, grid.bounds.getWest()], [lat, grid.bounds.getEast()]]} pathOptions={{ color: 'white', weight: 1, opacity: 0.6, dashArray: '5,5' }} />
      ))}
      {grid.lons.map(lon => (
        <Polyline key={`lon-${lon}`} positions={[[grid.bounds.getSouth(), lon], [grid.bounds.getNorth(), lon]]} pathOptions={{ color: 'white', weight: 1, opacity: 0.6, dashArray: '5,5' }} />
      ))}

      {/* 3. Marco Topográfico Intercalado (Blanco y Negro) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12px', zIndex: 999, backgroundImage: 'repeating-linear-gradient(to right, black 0, black 30px, white 30px, white 60px)', borderBottom: '1px solid black' }}></div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '12px', zIndex: 999, backgroundImage: 'repeating-linear-gradient(to right, black 0, black 30px, white 30px, white 60px)', borderTop: '1px solid black' }}></div>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '12px', zIndex: 999, backgroundImage: 'repeating-linear-gradient(to bottom, black 0, black 30px, white 30px, white 60px)', borderRight: '1px solid black' }}></div>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '12px', zIndex: 999, backgroundImage: 'repeating-linear-gradient(to bottom, black 0, black 30px, white 30px, white 60px)', borderLeft: '1px solid black' }}></div>

      {/* 4. Etiquetas Geográficas (Alineadas a la Grilla) */}
      {grid.lons.map(lon => {
        const pt = map.latLngToContainerPoint([grid.bounds.getSouth(), lon]);
        return <div key={`lbl-lon-${lon}`} style={{ ...labelStyle, left: pt.x, bottom: '-2px', top: 'auto', transform: 'translateX(-50%)' }}>{toDMS(lon, false)}</div>
      })}
      {grid.lats.map(lat => {
        const pt = map.latLngToContainerPoint([lat, grid.bounds.getWest()]);
        // Latitudes rotadas a 90 grados
        return <div key={`lbl-lat-${lat}`} style={{ ...verticalLabelStyle, left: '6px', top: pt.y }}>{toDMS(lat, true)}</div>
      })}
    </>
  );
};

// COMPONENTE: Ajusta la cámara
const MapUpdater: React.FC<{ data: FeatureCollection | null }> = ({ data }) => {
  const map = useMap();
  useEffect(() => {
    if (data && data.features.length > 0) {
      const layer = L.geoJSON(data as GeoJsonObject);
      const bounds = layer.getBounds();
      // Dejamos margen para que el marco y la plantilla no tapen el polígono
      if (bounds.isValid()) map.fitBounds(bounds, { paddingBottomRight: [320, 50], paddingTopLeft: [50, 50] });
    }
  }, [data, map]);
  return null;
};

// COMPONENTE: Minimapa estático
const MiniMapLocator: React.FC<{ data: FeatureCollection | null, estado: string, municipio: string }> = ({ data, estado, municipio }) => {
  if (!data || data.features.length === 0) return null;
  const bounds = L.geoJSON(data as GeoJsonObject).getBounds();
  const center = bounds.getCenter();

  return (
    <div className="bg-white p-1 mb-2 border border-dark" style={{ overflow: 'hidden' }}>
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Localización geográfica</div>
      <div style={{ height: '90px', width: '100%', position: 'relative' }}>
        <MapContainer center={center} zoom={5} zoomControl={false} dragging={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
          <CircleMarker center={center} radius={4} color="white" weight={1} fillColor="red" fillOpacity={1} />
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
  const printRef = useRef<HTMLDivElement>(null);

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
        const shpData = await shp(await zipFile.arrayBuffer());
        parsedData = Array.isArray(shpData) ? shpData[0] : shpData;
      } else if (kmlFile) {
        parsedData = kml(new DOMParser().parseFromString(await kmlFile.text(), 'text/xml'));
      } else if (geoJsonFile) {
        parsedData = JSON.parse(await geoJsonFile.text());
      }

      if (parsedData && (parsedData as GeoJsonObject).type !== 'FeatureCollection') {
        parsedData = { type: 'FeatureCollection', features: [parsedData] };
      }
      setGeoJsonData(parsedData as FeatureCollection);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Error espacial:", error);
      alert("Error procesando el archivo espacial.");
    }
  };

  const featureStyle = (feature?: Feature<Geometry, GeoJsonProperties>) => {
    if (!feature) return {};
    return { color: feature.properties?.stroke || '#163f37', weight: 2, fillColor: feature.properties?.fill || '#d6b56a', fillOpacity: 0.5 };
  };

  const pointToLayer = (_feature: Feature<Geometry, GeoJsonProperties>, latlng: L.LatLng) => {
    return L.circleMarker(latlng, { radius: 4, fillColor: "#ff0000", color: "#ffffff", weight: 1, opacity: 1, fillOpacity: 0.8 });
  };

  const handleDownloadImage = async () => {
    if (!printRef.current) return;
    try {
      const canvas = await html2canvas(printRef.current, { useCORS: true, allowTaint: true, scale: 2 });
      const link = document.createElement('a');
      link.download = `Mapa_Oficial_${previewData?.expediente || 'Dictamen'}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      console.error("Error al exportar:", error);
      alert("Hubo un error al generar la imagen.");
    }
  };

  const getSimbologia = () => {
    if (!geoJsonData) return [];
    const symMap = new Map();
    geoJsonData.features.forEach(f => {
      if (f.geometry.type === 'Point') return; 
      const name = f.properties?.name || 'Polígono';
      const color = f.properties?.fill || f.properties?.stroke || '#d6b56a';
      if (!symMap.has(name)) symMap.set(name, color);
    });
    return Array.from(symMap, ([name, color]) => ({ name, color }));
  };

  return (
    <div className="container-fluid h-100 p-0 m-0 d-flex position-relative bg-light-gray">
      
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

      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="btn text-white position-absolute shadow" style={{ top: '30px', left: '30px', zIndex: 1040, backgroundColor: '#163f37', borderRadius: '50%' }} title="Abrir Configuración">
          <i className="bi bi-gear-fill"></i>
        </button>
      )}

      {!isSidebarOpen && geoJsonData && (
        <button onClick={handleDownloadImage} className="btn btn-warning position-absolute shadow fw-bold" style={{ top: '30px', left: '80px', zIndex: 1040 }}>
          <i className="bi bi-download me-2"></i>Descargar Mapa Oficial
        </button>
      )}

      {/* ÁREA DEL MAPA (Exportable a JPG) */}
      <div className="flex-grow-1 position-relative p-0" style={{ height: '85vh', minHeight: '650px', backgroundColor: '#e9ecef' }}>
        
        <div ref={printRef} className="h-100 w-100 position-relative bg-white" style={{ padding: '12px' }}>
          {/* El contenedor interior deja el espacio para que se pinte el marco */}
          <div className="h-100 w-100 position-relative">
            <MapContainer center={mapCenter} zoom={6} zoomControl={false} style={{ height: '100%', width: '100%' }}>
              
              <TileLayer opacity={0.8} crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
              
              {/* Escala Gráfica y Grilla */}
              <ScaleControl position="bottomleft" imperial={false} />
              <GraticuleAndFrame />
              <MapUpdater data={geoJsonData} />

              {geoJsonData && <GeoJSON data={geoJsonData} style={featureStyle} pointToLayer={pointToLayer} />}
            </MapContainer>

            {/* PLANTILLA LATERAL DERECHA IN-MAP */}
            {previewData && (
              <div className="position-absolute bg-white p-3 shadow-sm" style={{ top: '20px', right: '20px', width: '280px', zIndex: 1000, border: '1px solid #333' }}>
                <div className="text-center mb-2">
                  <h6 className="fw-bold mb-0" style={{ fontSize: '0.75rem', color: '#000' }}>PROCURADURÍA FEDERAL DE PROTECCIÓN AL AMBIENTE</h6>
                  <span className="text-muted" style={{ fontSize: '0.6rem' }}>Subprocuraduría de Recursos Naturales</span>
                </div>
                
                <MiniMapLocator data={geoJsonData} estado={previewData.estado} municipio={previewData.municipio} />

                <div className="bg-white mb-2 border border-dark">
                  <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Simbología</div>
                  <div className="p-2">
                    {getSimbologia().map((item) => (
                      <div key={`sym-${item.name}`} className="d-flex align-items-center mb-1">
                        <div style={{ width: '12px', height: '12px', backgroundColor: item.color, border: '1px solid #000', marginRight: '8px' }}></div>
                        <span style={{ fontSize: '0.65rem', lineHeight: '1' }}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white mb-2 border border-dark">
                  <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem', padding: '2px' }}>Sistema de Referencia:</div>
                  <p className="mb-0 text-center p-1" style={{ fontSize: '0.65rem' }}>DATUM WGS84 Zona 14 N<br/>Proyección Transversal de Mercator</p>
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
  );
};