import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl, ScaleControl, CircleMarker } from 'react-leaflet';
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

// COMPONENTE: Ajusta la cámara principal
const MapUpdater: React.FC<{ data: FeatureCollection | null }> = ({ data }) => {
  const map = useMap();
  useEffect(() => {
    if (data && data.features.length > 0) {
      try {
        const layer = L.geoJSON(data as GeoJsonObject);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch (error) {
        console.error("Error al centrar:", error);
      }
    }
  }, [data, map]);
  return null;
};

// COMPONENTE: Minimapa estático de Localización Geográfica
const MiniMapLocator: React.FC<{ data: FeatureCollection | null }> = ({ data }) => {
  if (!data || data.features.length === 0) return null;
  
  const layer = L.geoJSON(data as GeoJsonObject);
  const bounds = layer.getBounds();
  const center = bounds.getCenter();

  return (
    <div className="bg-light p-1 mb-2 border" style={{ height: '140px', overflow: 'hidden' }}>
      <div className="fw-bold text-white text-center mb-1" style={{ backgroundColor: '#9e1c3f', fontSize: '0.75rem', padding: '2px' }}>
        Localización Geográfica
      </div>
      <MapContainer 
        center={center} 
        zoom={5} 
        zoomControl={false} 
        dragging={false} 
        scrollWheelZoom={false} 
        style={{ height: '105px', width: '100%' }}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
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
        const buffer = await zipFile.arrayBuffer();
        const shpData = await shp(buffer);
        parsedData = Array.isArray(shpData) ? shpData[0] : shpData;
      } else if (kmlFile) {
        const text = await kmlFile.text();
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        parsedData = kml(dom);
      } else if (geoJsonFile) {
        const text = await geoJsonFile.text();
        parsedData = JSON.parse(text);
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
      color: feature.properties?.stroke || '#d6b56a',
      weight: 3,
      fillColor: feature.properties?.fill || '#163f37',
      fillOpacity: 0.5
    };
  };

  const pointToLayer = (_feature: Feature<Geometry, GeoJsonProperties>, latlng: L.LatLng) => {
    return L.circleMarker(latlng, {
      radius: 5,
      fillColor: "#ff0000",
      color: "#ffffff",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    });
  };

  const handleDownloadImage = async () => {
    if (!printRef.current) return;
    try {
      const canvas = await html2canvas(printRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.download = `Mapa_Oficial_${previewData?.expediente || 'Dictamen'}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Error al exportar:", error);
      alert("Hubo un error al generar la imagen.");
    }
  };

  return (
    <div className="container-fluid h-100 p-0 m-0 d-flex flex-column flex-lg-row bg-light-gray">
      
      {/* PANEL IZQUIERDO: Formulario */}
      <div className="col-12 col-lg-3 p-4 bg-white border-end shadow-sm overflow-auto" style={{ zIndex: 10, maxHeight: '85vh' }}>
        <h5 className="fw-bold mb-3" style={{ color: '#163f37' }}>Datos del Dictamen</h5>
        
        <form onSubmit={handleSubmit(onSubmit)} className="d-flex flex-column gap-3">
          <div>
            <label htmlFor="expedienteInput" className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Expediente</label>
            <input id="expedienteInput" type="text" className="form-control form-control-sm" {...register('expediente', { required: true })} />
          </div>
          <div>
            <label htmlFor="actaInput" className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Acta de Inspección</label>
            <input id="actaInput" type="text" className="form-control form-control-sm" {...register('acta')} />
          </div>
          <div className="row">
            <div className="col-6">
              <label htmlFor="estadoInput" className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Estado</label>
              <input id="estadoInput" type="text" className="form-control form-control-sm" {...register('estado')} />
            </div>
            <div className="col-6">
              <label htmlFor="municipioInput" className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Municipio</label>
              <input id="municipioInput" type="text" className="form-control form-control-sm" {...register('municipio')} />
            </div>
          </div>
          <div>
            <label htmlFor="vegInput" className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Tipo de Vegetación</label>
            <input id="vegInput" type="text" className="form-control form-control-sm" {...register('vegetacion')} />
          </div>
          <div>
            <label htmlFor="dateInput" className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Fecha de Imagen</label>
            <input id="dateInput" type="date" className="form-control form-control-sm" {...register('targetDate', { required: true })} />
          </div>
          <div>
            <label htmlFor="fileInput" className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>Cargar Archivos</label>
            <input id="fileInput" type="file" accept=".geojson,.kml,.zip" className="form-control form-control-sm" {...register('polygonFile', { required: true })} />
          </div>

          <button type="submit" className="btn text-white fw-bold mt-2" style={{ backgroundColor: '#163f37' }}>
            Generar Previsualización
          </button>
          
          {geoJsonData && (
            <button type="button" onClick={handleDownloadImage} className="btn btn-outline-secondary fw-bold mt-2">
              <i className="bi bi-download me-2"></i>Descargar JPG Oficial
            </button>
          )}
        </form>
      </div>

      {/* PANEL DERECHO: Mapa Imprimible */}
      <div ref={printRef} className="col-12 col-lg-9 position-relative p-0" style={{ height: '85vh', minHeight: '600px' }}>
        
        <MapContainer center={mapCenter} zoom={6} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            crossOrigin="anonymous" 
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          
          <ScaleControl position="bottomleft" imperial={false} />
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
          <div className="position-absolute bg-white p-3" 
               style={{ top: '15px', right: '15px', width: '310px', zIndex: 1000, border: '2px solid #000', opacity: 0.95 }}>
            
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