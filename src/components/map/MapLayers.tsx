import { GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, Geometry } from 'geojson';
import { useMemo } from 'react';
import type {
  TypedMapFeature,
  LayerFeatureProperties as LayerFeatureProps,
} from '../../hooks/useMapLayers';

interface UserPolygonLayerProps {
  geoJsonData: FeatureCollection;
}

export const UserPolygonLayer = ({ geoJsonData }: UserPolygonLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of geoJsonData.features) {
        if (
          (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
          turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)
        ) {
          const polyId = typeof f.properties?.polyId === 'string' ? f.properties.polyId : '';
          let areaHtml = '';
          try {
            const areaSqMeters = turf.area(f);
            areaHtml = `<strong>Superficie calculada:</strong> ${areaSqMeters.toFixed(2)} m²<br/>`;
          } catch {
            /* ignorar */
          }

          let propsHtml = '';
          Object.entries(f.properties ?? {}).forEach(([key, val]) => {
            if (
              key !== 'polyId' &&
              key !== 'style' &&
              (typeof val === 'string' || typeof val === 'number') &&
              val !== ''
            ) {
              propsHtml += `<strong>${key}:</strong> ${val}<br/>`;
            }
          });

          const popupHtml = `<div style="font-size:0.85rem; min-width: 200px; max-height: 250px; overflow-y: auto;"><strong style="color:#d63384; font-size:1rem;">Datos del Polígono ${polyId}</strong><br/><div style="border-top:1px solid #ccc; margin: 4px 0;"></div>${areaHtml}${propsHtml}</div>`;
          L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(map);
          return;
        }
      }
    },
  });

  if (!geoJsonData?.features?.length) return null;

  const firstPolyId =
    typeof geoJsonData.features[0]?.properties?.polyId === 'string'
      ? geoJsonData.features[0].properties.polyId
      : '0';
  const layerKey = `user-layer-${geoJsonData.features.length}-${firstPolyId}`;

  return (
    <GeoJSON
      key={layerKey}
      data={geoJsonData}
      filter={(feature) =>
        Boolean(feature.geometry) &&
        feature.geometry.type !== 'Point' &&
        feature.geometry.type !== 'MultiPoint'
      }
      style={() => ({
        color: '#ff0000',
        weight: 3,
        fill: false,
        lineJoin: 'round',
        lineCap: 'round',
      })}
    />
  );
};

interface EcoLayerProps {
  ecoNearby: TypedMapFeature[];
}

const getEcoAreaName = (props?: LayerFeatureProps | null): string => {
  const candidates = [
    props?.NOMBRE,
    props?.NOM_AICA,
    props?.nombre,
    props?.Name,
    props?.NAME,
    props?.NOM,
    props?.SITIO,
  ];
  const found = candidates.find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );
  return found ?? 'Área Protegida';
};

export const EcoLayer = ({ ecoNearby }: EcoLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of ecoNearby) {
        if (
          (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
          turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)
        ) {
          const title = f.properties?._title ?? 'Área Protegida';
          const name = getEcoAreaName(f.properties);
          const color = f.properties?._color ?? '#000';
          L.popup()
            .setLatLng(e.latlng)
            .setContent(`<div><strong style="color:${color}">${title}</strong><br/>${name}</div>`)
            .openOn(map);
          return;
        }
      }
    },
  });

  const data = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (ecoNearby ?? []).filter((f) => Boolean(f?.geometry));
    if (!valid.length) return { type: 'FeatureCollection', features: [] };
    return turf.featureCollection(valid);
  }, [ecoNearby]);

  if (!data.features.length) return null;

  const layerKey = `eco-layer-${data.features.length}-${data.features[0]?.properties?._layerId ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        return {
          color: props?._color,
          weight: 1.5,
          fillColor: props?._color,
          fillOpacity: 0.15,
        };
      }}
    />
  );
};

interface VegLayerProps {
  vegNearby: TypedMapFeature[];
}

export const VegLayer = ({ vegNearby }: VegLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of vegNearby) {
        if (
          (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
          turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)
        ) {
          const tipo = f.properties?._type ?? '';
          L.popup()
            .setLatLng(e.latlng)
            .setContent(`<div><strong>Uso de Suelo</strong><br/>${tipo}</div>`)
            .openOn(map);
          return;
        }
      }
    },
  });

  const data = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (vegNearby ?? []).filter((f) => Boolean(f?.geometry));
    if (!valid.length) return { type: 'FeatureCollection', features: [] };
    return turf.featureCollection(valid);
  }, [vegNearby]);

  if (!data.features.length) return null;

  const layerKey = `veg-layer-${data.features.length}-${data.features[0]?.properties?._type ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        return {
          color: props?._color,
          weight: 1.5,
          fillColor: props?._color,
          fillOpacity: 0.35,
        };
      }}
    />
  );
};

interface ClimateLayerProps {
  climateNearby: TypedMapFeature[];
}

export const ClimateLayer = ({ climateNearby }: ClimateLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of climateNearby) {
        if (
          (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
          turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)
        ) {
          const tipo = f.properties?._type ?? '';
          L.popup()
            .setLatLng(e.latlng)
            .setContent(`<div><strong>Unidad Climática</strong><br/>${tipo}</div>`)
            .openOn(map);
          return;
        }
      }
    },
  });

  const data = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (climateNearby ?? []).filter((f) => Boolean(f?.geometry));
    if (!valid.length) return { type: 'FeatureCollection', features: [] };
    return turf.featureCollection(valid);
  }, [climateNearby]);

  if (!data.features.length) return null;

  const layerKey = `climate-layer-${data.features.length}-${data.features[0]?.properties?._type ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        return {
          color: props?._color,
          weight: 1.5,
          fillColor: props?._color,
          fillOpacity: 0.35,
        };
      }}
    />
  );
};

interface EdafologiaLayerProps {
  edafologiaNearby: TypedMapFeature[];
}

export const EdafologiaLayer = ({ edafologiaNearby }: EdafologiaLayerProps) => {
  const map = useMapEvents({
    click(e) {
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of edafologiaNearby) {
        if (
          (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
          turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)
        ) {
          const tipo = f.properties?._type ?? '';
          const sub = f.properties?._subtitle ? `<br/><small>${f.properties._subtitle}</small>` : '';
          L.popup()
            .setLatLng(e.latlng)
            .setContent(`<div><strong>Unidad Edafológica</strong><br/>${tipo}${sub}</div>`)
            .openOn(map);
          return;
        }
      }
    },
  });

  const data = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (edafologiaNearby ?? []).filter((f) => Boolean(f?.geometry));
    if (!valid.length) return { type: 'FeatureCollection', features: [] };
    return turf.featureCollection(valid);
  }, [edafologiaNearby]);

  if (!data.features.length) return null;

  const layerKey = `edafologia-layer-${data.features.length}-${data.features[0]?.properties?._type ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        return {
          color: props?._color,
          weight: 1.5,
          fillColor: props?._color,
          fillOpacity: 0.35,
        };
      }}
    />
  );
};