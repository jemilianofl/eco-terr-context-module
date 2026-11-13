import { GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { useMemo } from 'react';

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

          const popupHtml = `<div style="font-size:0.85rem; min-width: 200px; max-height: 250px; overflow-y: auto;"><strong style="color:#d63384; font-size:1rem;">Datos del Polígono ${polyId}</strong><br/><div style="border-top:1px solid #ccc; margin: 4px 0;"></div>${areaHtml}${propsHtml}</div>`;
          L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(map);
          return;
        }
      }
    }
  });

  if (!geoJsonData || !geoJsonData.features || geoJsonData.features.length === 0) return null;

  const layerKey = `user-layer-${geoJsonData.features.length}-${geoJsonData.features[0]?.properties?.polyId || '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={geoJsonData}
      filter={(feature) => feature.geometry.type !== 'Point' && feature.geometry.type !== 'MultiPoint'}
      style={() => ({
        color: '#ff0000', // Color del contorno (rojo)
        weight: 3,        // Grosor del contorno
        fill: false,      // <-- AÑADIDO: Desactiva el relleno por completo
        // fillColor: '#ff0000', // (Opcional, puedes borrar o comentar esta línea si usas fill: false)
        // fillOpacity: 0.3,     // (Opcional, puedes borrar o comentar esta línea si usas fill: false)
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
          const name = f.properties?.NOMBRE || f.properties?.NOM_AICA || f.properties?.nombre || f.properties?.Name || f.properties?.NAME || f.properties?.NOM || f.properties?.SITIO || 'Área Protegida';
          L.popup().setLatLng(e.latlng).setContent(`<div><strong style="color:${f.properties?._color || '#000'}">${title}</strong><br/>${name}</div>`).openOn(map);
          return;
        }
      }
    }
  });
  
  const data = useMemo(() => {
    if (!ecoNearby || ecoNearby.length === 0) return { type: 'FeatureCollection', features: [] } as FeatureCollection;
    return turf.featureCollection(ecoNearby) as FeatureCollection;
  }, [ecoNearby]);

  if (!data.features || data.features.length === 0) return null;

  const layerKey = `eco-layer-${data.features.length}-${data.features[0]?.properties?._layerId || '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      style={(f) => ({
        color: f?.properties?._color,
        weight: 1.5,
        fillColor: f?.properties?._color,
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

  const data = useMemo(() => {
    if (!vegNearby || vegNearby.length === 0) return { type: 'FeatureCollection', features: [] } as FeatureCollection;
    return turf.featureCollection(vegNearby) as FeatureCollection;
  }, [vegNearby]);

  if (!data.features || data.features.length === 0) return null;

  const layerKey = `veg-layer-${data.features.length}-${data.features[0]?.properties?._type || '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      style={(f) => ({
        color: f?.properties?._color,
        weight: 1.5,
        fillColor: f?.properties?._color,
        fillOpacity: 0.35
      })}
    />
  );
};