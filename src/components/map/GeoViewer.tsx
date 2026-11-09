import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl, ScaleControl, CircleMarker, useMapEvents } from 'react-leaflet';
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

// COMPONENTE: Convertidor a Grados, Minutos y Segundos
const toDMS = (deg: number, isLat: boolean) => {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);
  const direction = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${degrees}°${minutes}'${seconds}"${direction}`;
};

// COMPONENTE: Marco de coordenadas (Estilo Topográfico)
const CoordinateFrame: React.FC = () => {
  const map = useMap();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);

  useEffect(() => setBounds(map.getBounds()), [map]);
  useMapEvents({
    move: () => setBounds(map.getBounds()),
    zoom: () => setBounds(map.getBounds())
  });

  if (!bounds) return null;

  const n = bounds.getNorth();
  const s = bounds.getSouth();
  const e = bounds.getEast();
  const w = bounds.getWest();

  const labelStyle: React.CSSProperties = {
    position: 'absolute', backgroundColor: '#ffffff', padding: '2px 5px',
    fontSize: '0.65rem', fontWeight: 'bold', zIndex: 1000,
    border: '1px solid #000', pointerEvents: 'none'
  };

  return (
    <>
      {/* Marco blanco grueso con borde negro simulando plantilla oficial */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        border: '15px solid #ffffff', zIndex: 999, pointerEvents: 'none'
      }}>
        <div style={{ width: '100%', height: '100%', border: '2px solid #000' }}></div>
      </div>

      {/* Etiquetas Eje Y (Latitudes) */}
      <div style={{ ...labelStyle, top: '20%', left: 0 }}>{toDMS(n - (n - s) * 0.2, true)}</div>
      <div style={{ ...labelStyle, top: '50%', left: 0, transform: 'translateY(-50%)' }}>{toDMS((n + s) / 2, true)}</div>
      <div style={{ ...labelStyle, bottom: '20%', left: 0 }}>{toDMS(s + (n - s) * 0.2, true)}</div>

      {/* Etiquetas Eje X (Longitudes) */}
      <div style={{ ...labelStyle, bottom: 0, left: '25%', transform: 'translateX(-50%)' }}>{toDMS(w + (e - w) * 0.25, false)}</div>
      <div style={{ ...labelStyle, bottom: 0, left: '50%', transform: 'translateX(-50%)' }}>{toDMS((e + w) / 2, false)}</div>
      <div style={{ ...labelStyle, bottom: 0, right: '25%', transform: 'translateX(50%)' }}>{toDMS(e - (e - w) * 0.25, false)}</div>
    </>
  );
};

// COMPONENTE: Ajusta la cámara principal
const MapUpdater: React.FC<{ data: FeatureCollection | null }> = ({ data }) => {
  const map = useMap();
  useEffect(() => {
    if (data && data.features.length > 0) {
      const layer = L.geoJSON(data as GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60] }); // Más padding para que no tape el marco
    }
  }, [data, map]);
  return null;
};

// COMPONENTE: Minimapa estático de Localización
const MiniMapLocator: React.FC<{ data: FeatureCollection | null }> = ({ data }) => {
  if (!data || data.features.length === 0) return null;
  const bounds = L.geoJSON(data as GeoJsonObject).getBounds();
  const center = bounds.getCenter();

  return (
    <div className="bg-light p-1 mb-2 border" style={{ height: '140px', overflow: 'hidden' }}>
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>
        Localización Geográfica
      </div>
      <MapContainer center={center} zoom={5} zoomControl={false} dragging={false} scrollWheelZoom={false} style={{ height: '105px', width: '100%' }}>
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
        <CircleMarker center={center} radius={4} color="white" weight={1} fillColor="red" fillOpacity={1} />
      </MapContainer>
    </div>
  );
};

export const GeoViewer: React.FC = () => {
  const { register, handleSubmit } = useForm<FormData>();
  const [mapCenter] = useState<[number, number]>([19.4326, -99.1332]); 
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [previewData, setPreviewData] = useState<FormData | null>(null);
  
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
    } catch (error) {
      console.error("Error espacial:", error);
      alert("Error procesando el archivo espacial.");
    }
  };

  const featureStyle = (feature?: Feature<Geometry, GeoJsonProperties>) => {
    if (!feature) return {};
    return {
      color: feature.properties?.stroke || '#d6b56a', weight: 3,
      fillColor: feature.properties?.fill || '#163f37', fillOpacity: 0.5
    };
  };

  const pointToLayer = (_feature: Feature<Geometry, GeoJsonProperties>, latlng: L.LatLng) => {
    return L.circleMarker(latlng, { radius: 5, fillColor: "#ff0000", color: "#ffffff", weight: 1, opacity: 1, fillOpacity: 0.8 });
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

  return (
    <div className="container-fluid h-100 p-0 m-0 d-flex flex-column flex-lg-row bg-light-gray">
      
      {/* PANEL IZQUIERDO */}
      <div className="col-12 col-lg-3 p-4 bg-white border-end shadow-sm overflow-auto" style={{ zIndex: 10, maxHeight: '85vh' }}>
        <h5 className="fw-bold mb-3" style={{ color: '#163f37' }}>Datos del Dictamen</h5>
        
        <form onSubmit={handleSubmit(onSubmit)} className="d-flex flex-column gap-3">
          <div><label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Expediente</label><input type="text" className="form-control form-control-sm" {...register('expediente', { required: true })} /></div>
          <div><label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Acta de Inspección</label><input type="text" className="form-control form-control-sm" {...register('acta')} /></div>
          <div className="row">
            <div className="col-6"><label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Estado</label><input type="text" className="form-control form-control-sm" {...register('estado')} /></div>
            <div className="col-6"><label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Municipio</label><input type="text" className="form-control form-control-sm" {...register('municipio')} /></div>
          </div>
          <div><label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Tipo de Vegetación</label><input type="text" className="form-control form-control-sm" {...register('vegetacion')} /></div>
          <div><label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Fecha de Imagen</label><input type="date" className="form-control form-control-sm" {...register('targetDate', { required: true })} /></div>
          <div><label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Cargar Archivos</label><input type="file" accept=".geojson,.kml,.zip" className="form-control form-control-sm" {...register('polygonFile', { required: true })} /></div>

          <button type="submit" className="btn text-white fw-bold mt-2" style={{ backgroundColor: '#163f37' }}>Generar Previsualización</button>
          {geoJsonData && <button type="button" onClick={handleDownloadImage} className="btn btn-outline-secondary fw-bold mt-2"><i className="bi bi-download me-2"></i>Descargar JPG Oficial</button>}
        </form>
      </div>

      {/* PANEL DERECHO */}
      <div ref={printRef} className="col-12 col-lg-9 position-relative p-0" style={{ height: '85vh', minHeight: '600px' }}>
        
        {/* Fondo blanco para que la opacidad 0.75 del mapa se vea clara */}
        <MapContainer center={mapCenter} zoom={6} zoomControl={false} style={{ height: '100%', width: '100%', backgroundColor: '#ffffff' }}>
          
          {/* Capa Satélite: Con opacidad 75% para que sea mucho más clara */}
          <TileLayer opacity={0.75} crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          
          {/* Capa Límites Estatales y Referencias Geográficas */}
          <TileLayer crossOrigin="anonymous" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
          
          <ScaleControl position="bottomleft" imperial={false} />
          <CoordinateFrame />
          <MapUpdater data={geoJsonData} />

          {geoJsonData && (
            <LayersControl position="topleft">
              {geoJsonData.features.map((feature, index) => {
                const nameId = feature.properties?.name || `Cap-${index}`;
                return (
                  <LayersControl.Overlay key={`${nameId}-${index}`} checked name={feature.properties?.name || `Elemento ${index + 1}`}>
                    <GeoJSON data={feature} style={featureStyle} pointToLayer={pointToLayer} />
                  </LayersControl.Overlay>
                );
              })}
            </LayersControl>
          )}
        </MapContainer>

        {previewData && (
          <div className="position-absolute bg-white p-3" style={{ top: '25px', right: '25px', width: '310px', zIndex: 1000, border: '2px solid #000' }}>
            <div className="text-center mb-2">
              <h6 className="fw-bold mb-0" style={{ fontSize: '0.8rem', color: '#163f37' }}>PROCURADURÍA FEDERAL DE PROTECCIÓN AL AMBIENTE</h6>
              <span className="text-muted" style={{ fontSize: '0.65rem' }}>Subprocuraduría de Recursos Naturales</span>
            </div>
            
            <MiniMapLocator data={geoJsonData} />

            <div className="bg-light p-2 mb-2 border">
              <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>Datos Generales</div>
              <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Expediente:</strong> {previewData.expediente}</p>
              <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Acta:</strong> {previewData.acta}</p>
              <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Estado:</strong> {previewData.estado}</p>
              <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Municipio:</strong> {previewData.municipio}</p>
              <p className="mb-0" style={{ fontSize: '0.7rem' }}><strong>Vegetación:</strong> {previewData.vegetacion}</p>
            </div>

            <div className="bg-light p-2 mb-2 border">
              <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#163f37', fontSize: '0.75rem', padding: '2px' }}>Sistema de Referencia</div>
              <p className="mb-0 text-center" style={{ fontSize: '0.7rem' }}>DATUM WGS84<br/>Proyección Transversal de Mercator</p>
            </div>

            <div className="text-end mt-2" style={{ fontSize: '0.65rem', borderTop: '1px solid #ccc', paddingTop: '5px' }}>
              <strong>Fecha:</strong> {previewData.targetDate}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};