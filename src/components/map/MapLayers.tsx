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
          
          // Calculamos el área
          let areaHtml = '';
          try {
            const areaSqMeters = turf.area(f);
            areaHtml = `<strong>Superficie calculada:</strong> ${areaSqMeters.toFixed(2)} m²<br/>`;
          } catch { /* ignorar */ }

          // Restauramos las propiedades del archivo original
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
      style={() => ({ color: '#ff0000', weight: 2.5, fillColor: '#ff0000', fillOpacity: 0 })}
      // Esto evita que Leaflet ponga el marcador azul por defecto y dibuja tu punto rojo
      pointToLayer={(_, latlng) => L.circleMarker(latlng, { 
        radius: 5, 
        fillColor: '#ff0000', 
        color: '#ffffff', 
        weight: 1.5, 
        opacity: 1, 
        fillOpacity: 1, 
        pane: 'markerPane' 
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
          L.popup().setLatLng(e.latlng).setContent(`<div><strong>${title}</strong><br/>${f.properties?.NOMBRE || ''}</div>`).openOn(map);
          return;
        }
      }
    }
  });
  return <GeoJSON data={turf.featureCollection(ecoNearby)} style={(f) => ({ color: f?.properties?._color, weight: 2, fillColor: f?.properties?._color, fillOpacity: 0.25 })} />;
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