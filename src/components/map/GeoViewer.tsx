import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { useForm } from 'react-hook-form';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type { GeoJsonObject } from 'geojson';
import L from 'leaflet';

interface FormData {
  targetDate: string;
  polygonFile: FileList;
}

// NUEVO COMPONENTE: Ajusta la cámara del mapa al polígono cargado
const MapUpdater: React.FC<{ data: GeoJsonObject | null }> = ({ data }) => {
  const map = useMap();
  
  useEffect(() => {
    if (data) {
      const layer = L.geoJSON(data);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] }); // Se acerca dejando un margen de 50px
      }
    }
  }, [data, map]);

  return null;
};

export const GeoViewer: React.FC = () => {
  const { register, handleSubmit } = useForm<FormData>();
  const [mapCenter] = useState<[number, number]>([19.4326, -99.1332]); 
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);

  const onSubmit = async (data: FormData) => {
    const files = data.polygonFile;
    if (!files || files.length === 0) return;

    try {
      const zipFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.zip'));
      if (zipFile) {
        const buffer = await zipFile.arrayBuffer();
        const parsedGeoJson = await shp(buffer);
        const finalGeoJson = Array.isArray(parsedGeoJson) ? parsedGeoJson[0] : parsedGeoJson;
        setGeoJsonData(finalGeoJson as GeoJsonObject);
        return;
      }

      const kmlFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.kml'));
      if (kmlFile) {
        const text = await kmlFile.text();
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        const parsedGeoJson = kml(dom);
        setGeoJsonData(parsedGeoJson as GeoJsonObject);
        return;
      }

      const geoJsonFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.geojson'));
      if (geoJsonFile) {
        const text = await geoJsonFile.text();
        setGeoJsonData(JSON.parse(text) as GeoJsonObject);
        return;
      }

      alert("Formato no soportado. Sube un .zip, .kml o .geojson.");

    } catch (error) {
      console.error("Error al procesar el archivo espacial:", error);
      alert("Hubo un error al leer el archivo. Verifica que no esté corrupto.");
    }
  };

  return (
    <div className="container-fluid h-100 p-0 m-0 d-flex flex-column flex-lg-row bg-light-gray">
      <div className="col-12 col-lg-3 p-4 bg-white border-end shadow-sm" style={{ zIndex: 10 }}>
        <h4 className="fw-bold mb-4" style={{ color: '#163f37' }}>Contexto Ecológico-Territorial</h4>
        
        <form onSubmit={handleSubmit(onSubmit)} className="d-flex flex-column gap-3">
          <div>
            <label htmlFor="targetDate" className="form-label fw-semibold">Fecha de Imagen Satelital</label>
            <input 
              id="targetDate"
              type="date" 
              className="form-control" 
              {...register('targetDate', { required: true })}
            />
          </div>

          <div>
            <label htmlFor="polygonFile" className="form-label fw-semibold">Cargar Polígono</label>
            <input 
              id="polygonFile"
              type="file" 
              accept=".geojson,.kml,.zip"
              className="form-control" 
              {...register('polygonFile', { required: true })}
            />
          </div>

          <button type="submit" className="btn text-white fw-bold mt-3" style={{ backgroundColor: '#163f37' }}>
            Generar Mapa Base
          </button>
        </form>
      </div>

      <div className="col-12 col-lg-9 position-relative h-100 p-0">
        <MapContainer center={mapCenter} zoom={6} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* NUEVO: Componente invisible que maneja el zoom automático */}
          <MapUpdater data={geoJsonData} />

          {geoJsonData && (
            <GeoJSON 
              key={JSON.stringify(geoJsonData).substring(0, 100)} 
              data={geoJsonData} 
              style={{ color: '#d6b56a', weight: 3, fillColor: '#163f37', fillOpacity: 0.5 }} 
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
};