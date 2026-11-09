import React, { useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { useForm } from 'react-hook-form';

interface FormData {
    targetDate: string;
    polygonFile: FileList;
}

export const GeoViewer: React.FC = () => {
    const { register, handleSubmit } = useForm<FormData>();
    const [mapCenter] = useState<[number, number]>([19.4326, -99.1332]); // CDMX por defecto

    const onSubmit = (data: FormData) => {
        console.log("Datos del formulario listos para procesar o enviar al backend:", data);
        // Aquí implementaremos la lógica de lectura de GeoJSON y llamada al futuro backend de NestJS
    };

    return (
        <div className="container-fluid h-100 p-0 m-0 d-flex flex-column flex-lg-row bg-light-gray">
            {/* Panel Izquierdo: Formulario */}
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
                        <label className="form-label fw-semibold">Cargar Polígono (GeoJSON)</label>
                        <input
                            type="file"
                            accept=".geojson"
                            className="form-control"
                            {...register('polygonFile', { required: true })}
                        />
                    </div>

                    <button type="submit" className="btn text-white fw-bold mt-3" style={{ backgroundColor: '#163f37' }}>
                        Generar Mapa Base
                    </button>
                </form>
            </div>

            {/* Panel Derecho: Mapa */}
            <div className="col-12 col-lg-9 position-relative h-100 p-0">
                {/* Leaflet MapContainer requiere altura fija o 100% explícito */}
                <MapContainer center={mapCenter} zoom={6} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {/* Aquí inyectaremos los GeoJSONs locales de la carpeta /layers y la capa WMS en pasos posteriores */}
                </MapContainer>
            </div>
        </div>
    );
};