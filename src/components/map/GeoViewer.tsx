import React, { useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { useForm } from 'react-hook-form';

interface FormData {
  targetDate: string;
  polygonFile: FileList;
}

export const GeoViewer: React.FC = () => {
  const { register, handleSubmit } = useForm<FormData>();
  const [mapCenter] = useState<[number, number]>([19.4326, -99.1332]); // CDMX
  
  // Estado para almacenar los datos del polígono que dibujaremos
  const [geoJsonData, setGeoJsonData] = useState<any>(null);

  const onSubmit = (data: FormData) => {
    const files = data.polygonFile;
    if (!files || files.length === 0) return;

    // Buscamos si el usuario subió un archivo .geojson
    const geoJsonFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.geojson'));

    if (geoJsonFile) {
      // Usamos FileReader para leer el contenido del archivo en el navegador
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsedGeoJson = JSON.parse(content);
          
          // Actualizamos el estado, esto forzará a Leaflet a redibujar el mapa
          setGeoJsonData(parsedGeoJson);
        } catch (error) {
          console.error("Error al procesar el GeoJSON", error);
          alert("El archivo GeoJSON tiene un formato inválido.");
        }
      };
      reader.readAsText(geoJsonFile);
    } else {
      alert("Por favor sube un archivo .geojson por ahora. Soporte para SHP y KML está en construcción.");
    }
  };

  return (
    <div className="container-fluid h-100 p-0 m-0 d-flex flex-column flex-lg-row bg-light-gray">
      <div className="col-12 col-lg-3 p-4 bg-white border-end shadow-sm" style={{ zIndex: 10 }}>
        <h4 className="fw-bold mb-4" style={{ color: '#163f37' }}>Contexto Ecológico-Territorial</h4>
        
        <form onSubmit={handleSubmit(onSubmit)} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label fw-semibold">Fecha de Imagen Satelital</label>
            <input 
              type="date" 
              className="form-control" 
              {...register('targetDate', { required: true })}
            />
            <small className="text-muted">Se buscará una imagen Sentinel-2 +/- 15 días.</small>
          </div>

          <div>
            <label className="form-label fw-semibold">Cargar Polígono (Múltiples formatos)</label>
            <input 
              type="file" 
              accept=".geojson,.kml,.kmz,.shp,.dbf,.shx,.prj,.cpg,.zip"
              multiple
              className="form-control" 
              {...register('polygonFile', { required: true })}
            />
            <small className="text-muted d-block mt-1">
              Formatos: GeoJSON, KML, KMZ o SHP. <br/>
              <strong>Nota para SHP:</strong> Sube todos los archivos (.shp, .dbf, .shx, .prj) juntos o en un .zip.
            </small>
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
          
          {/* Si tenemos datos en el estado, Leaflet dibuja la capa */}
          {geoJsonData && (
            <GeoJSON 
              key={JSON.stringify(geoJsonData)} // Forzamos un re-render si cambia el archivo
              data={geoJsonData} 
              style={{ color: '#d6b56a', weight: 2, fillColor: '#163f37', fillOpacity: 0.4 }} 
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
};