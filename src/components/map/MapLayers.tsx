import { GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

interface UserPolygonLayerProps {
  geoJsonData: FeatureCollection;
}

export const UserPolygonLayer = ({ geoJsonData }: UserPolygonLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of geoJsonData.features) {
        if (f.geometry.type !== 'Point' && turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)) {
          const polyId = f.properties?.polyId || '';
          
          let areaHtml = '';
          try {
            const areaSqMeters = turf.area(f);
            areaHtml = `<strong>Superficie calculada:</strong> ${areaSqMeters.toFixed(2)} m²<br/>`;
          } catch { /* ignorar */ }

          let propsHtml = '';
          Object.entries(f.properties || {}).forEach(([key, val]) => {
            if (key !== 'polyId' && key !== 'style' && val !== null && val !== undefined && val !== '') {
              propsHtml += `<strong>${key}:</strong> ${val}<br/>`;
            }
          });

          const popupHtml = `
            <div style="font-size:0.85rem; min-width: 200px; max-height: 250px; overflow-y: auto;">
              <strong style="color:#d63384; font-size:1rem;">Datos del Polígono ${polyId}</strong><br/>
              <div style="border-top:1px solid #ccc; margin: 4px 0;"></div>
              ${areaHtml}
              ${propsHtml}
            </div>
          `;
          
          L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(map);
          return;
        }
      }
    }
  });

  return (
    <GeoJSON 
      data={geoJsonData} 
      filter={(feature) => feature.geometry.type !== 'Point' && feature.geometry.type !== 'MultiPoint'}
      style={() => ({ 
        color: '#ff0000', 
        weight: 3,         
        fillColor: '#ff0000', 
        fillOpacity: 0.3,  
        lineJoin: 'round',
        lineCap: 'round'
      })}
    />
  );
};

interface EcoLayerProps {
  ecoNearby: Feature[];
}

export const EcoLayer = ({ ecoNearby }: EcoLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of ecoNearby) {
        if (turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)) {
          const title = f.properties?._title || 'Área Protegida';
          // Se busca el nombre en múltiples campos posibles
          const name = f.properties?.NOMBRE || f.properties?.NOM_AICA || f.properties?.nombre || f.properties?.Name || f.properties?.NAME || f.properties?.NOM || f.properties?.SITIO || 'Área Protegida';
          
          L.popup().setLatLng(e.latlng).setContent(`<div><strong style="color:${f.properties?._color || '#000'}">${title}</strong><br/>${name}</div>`).openOn(map);
          return;
        }
      }
    }
  });
  return (
    <GeoJSON 
      data={turf.featureCollection(ecoNearby)} 
      style={(f) => ({ 
        color: f?.properties?._color, 
        weight: 1.5, 
        fillColor: f?.properties?._color, 
        // Opacidad muy baja (0.15) y borde delgado (1.5) para que al sobreponerse (ej. Ramsar sobre AICA) se vean ambas
        fillOpacity: 0.15 
      })} 
    />
  );
};

interface VegLayerProps {
  vegNearby: Feature[];
}

export const VegLayer = ({ vegNearby }: VegLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of vegNearby) {
        if (turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)) {
          L.popup().setLatLng(e.latlng).setContent(`<div><strong>Uso de Suelo</strong><br/>${f.properties?._type}</div>`).openOn(map);
          return;
        }
      }
    }
  });
  return <GeoJSON data={turf.featureCollection(vegNearby)} style={(f) => ({ color: f?.properties?._color, weight: 1.5, fillColor: f?.properties?._color, fillOpacity: 0.35 })} />;
};