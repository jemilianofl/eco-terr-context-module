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
          L.popup().setLatLng(e.latlng).setContent(`<div style="font-size:0.85rem"><strong>Polígono Inspeccionado ${polyId}</strong></div>`).openOn(map);
          return;
        }
      }
    }
  });

  return <GeoJSON data={geoJsonData} style={{ color: '#ff0000', weight: 2.5, fillColor: '#ff0000', fillOpacity: 0 }} />;
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