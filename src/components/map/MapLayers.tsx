import { GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, Geometry } from 'geojson';
import { useMemo } from 'react';
import type {
  TypedMapFeature,
  LayerFeatureProperties as LayerFeatureProps,
} from '../../hooks/useMapLayers';
import { getStrahlerStyle } from '../../config/mapConfig';

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

interface HidrologiaLayerProps {
  subcuencasNearby: TypedMapFeature[];
  cuerposAguaNearby: TypedMapFeature[];
  corrientesNearby: TypedMapFeature[];
  microcuencaData?: FeatureCollection | null;
}

export const HidrologiaLayer = ({
  subcuencasNearby,
  cuerposAguaNearby,
  corrientesNearby,
  microcuencaData,
}: HidrologiaLayerProps) => {
  const subcuencasFc = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (subcuencasNearby ?? []).filter((f) => Boolean(f?.geometry));
    return valid.length ? turf.featureCollection(valid) : { type: 'FeatureCollection', features: [] };
  }, [subcuencasNearby]);

  const cuerposAguaFc = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (cuerposAguaNearby ?? []).filter((f) => Boolean(f?.geometry));
    return valid.length ? turf.featureCollection(valid) : { type: 'FeatureCollection', features: [] };
  }, [cuerposAguaNearby]);

  const corrientesFc = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (corrientesNearby ?? []).filter((f) => Boolean(f?.geometry));
    return valid.length ? turf.featureCollection(valid) : { type: 'FeatureCollection', features: [] };
  }, [corrientesNearby]);

  const onEachSubcuenca = (feature: Feature<Geometry, LayerFeatureProps>, layer: L.Layer) => {
    const p = feature.properties ?? {};
    const subcuenca = typeof p.SUBCUENCA === 'string' ? p.SUBCUENCA : 'N/D';
    const cveSubc = typeof p.CVE_SUBCUE === 'string' ? ` (${p.CVE_SUBCUE})` : '';
    const cuenca = typeof p.CUENCA === 'string' ? p.CUENCA : 'N/D';
    const rh = typeof p.RH === 'string' ? p.RH : 'N/D';
    const areaKm2 = p.AREA_KM2 !== undefined ? `${Number(p.AREA_KM2).toFixed(2)} km²` : 'N/D';
    const tipo = typeof p.TIPO === 'string' ? p.TIPO : 'N/D';
    const drenaje = typeof p.DRENAJE1 === 'string' ? p.DRENAJE1 : 'N/D';

    layer.bindPopup(
      `<div style="font-size:0.82rem; min-width:210px;">
        <strong style="color:#0369a1;">Subcuenca 1:50,000 (SIATL)</strong>
        <div style="border-top:1px solid #ccc; margin:4px 0;"></div>
        <strong>Subcuenca:</strong> ${subcuenca}${cveSubc}<br/>
        <strong>Cuenca:</strong> ${cuenca}<br/>
        <strong>Región Hidrológica:</strong> ${rh}<br/>
        <strong>Superficie:</strong> ${areaKm2}<br/>
        <strong>Tipo / Descarga:</strong> ${tipo} — ${drenaje}
      </div>`
    );
  };

  const onEachMicrocuenca = (_feature: Feature, layer: L.Layer) => {
    layer.bindPopup(
      `<div style="font-size:0.82rem;">
        <strong style="color:#78350f;">Microcuenca del Sitio (SIATL)</strong><br/>
        Polígono delimitado aguas arriba del punto de drenaje.
      </div>`
    );
  };

  const onEachCuerpoAgua = (feature: Feature<Geometry, LayerFeatureProps>, layer: L.Layer) => {
    const p = feature.properties ?? {};
    const condicion = typeof p.CONDICION === 'string' ? p.CONDICION : 'Cuerpo de agua';
    layer.bindPopup(
      `<div style="font-size:0.82rem;">
        <strong style="color:#0284c7;">Cuerpo de Agua 1:50,000</strong><br/>
        <strong>Condición:</strong> ${condicion}
      </div>`
    );
  };

  const onEachCorriente = (feature: Feature<Geometry, LayerFeatureProps>, layer: L.Layer) => {
    const p = feature.properties ?? {};
    const orden = p.ORDER_1 !== undefined ? String(p.ORDER_1) : 'N/D';
    const condicion = typeof p.CONDICION === 'string' ? p.CONDICION : 'N/D';
    const entidad = typeof p.ENTIDAD === 'string' ? p.ENTIDAD : 'Corriente de agua';
    const cveSubc = typeof p.CVE_SUBC === 'string' ? p.CVE_SUBC : 'N/D';
    const lengthMeters = Number(p.LENGTHM);
    let longitudStr = 'N/D';
    if (Number.isFinite(lengthMeters)) {
      longitudStr =
        lengthMeters >= 1000
          ? `${(lengthMeters / 1000).toFixed(2)} km`
          : `${lengthMeters.toFixed(0)} m`;
    }

    layer.bindPopup(
      `<div style="font-size:0.82rem; min-width:200px;">
        <strong style="color:#1e3a8a;">Red Hidrográfica 1:50,000 (SIATL)</strong>
        <div style="border-top:1px solid #ccc; margin:4px 0;"></div>
        <strong>Tipo:</strong> ${entidad}<br/>
        <strong>Orden de escorrentía (Strahler):</strong> ${orden}<br/>
        <strong>Condición:</strong> ${condicion}<br/>
        <strong>Longitud del tramo:</strong> ${longitudStr}<br/>
        <strong>Clave Subcuenca:</strong> ${cveSubc}
      </div>`
    );
  };

  return (
    <>
      {subcuencasFc.features.length > 0 && (
        <GeoJSON
          key={`subcuencas-50k-${subcuencasFc.features.length}`}
          data={subcuencasFc}
          style={() => ({
            color: '#78350f',
            weight: 2,
            dashArray: '6, 4',
            fillColor: '#d6c7a9',
            fillOpacity: microcuencaData?.features?.length ? 0.08 : 0.24,
          })}
          onEachFeature={onEachSubcuenca}
        />
      )}

      {microcuencaData && microcuencaData.features.length > 0 && (
        <GeoJSON
          key={`microcuenca-siatl-${microcuencaData.features.length}`}
          data={microcuencaData}
          filter={(feature) =>
            Boolean(feature.geometry) &&
            feature.geometry.type !== 'Point' &&
            feature.geometry.type !== 'MultiPoint'
          }
          style={() => ({
            color: '#5c4033',
            weight: 2,
            fillColor: '#c8b598',
            fillOpacity: 0.42,
          })}
          onEachFeature={onEachMicrocuenca}
        />
      )}

      {cuerposAguaFc.features.length > 0 && (
        <GeoJSON
          key={`cuerpos-agua-50k-${cuerposAguaFc.features.length}`}
          data={cuerposAguaFc}
          style={() => ({
            color: '#0284c7',
            weight: 1,
            fillColor: '#38bdf8',
            fillOpacity: 0.55,
          })}
          onEachFeature={onEachCuerpoAgua}
        />
      )}

      {corrientesFc.features.length > 0 && (
        <GeoJSON
          key={`corrientes-50k-${corrientesFc.features.length}`}
          data={corrientesFc}
          style={(f) => {
            const props = f?.properties as LayerFeatureProps | undefined;
            const style = getStrahlerStyle(props?.ORDER_1);
            return {
              color: style.color,
              weight: style.weight,
              opacity: style.opacity,
              lineCap: 'round',
              lineJoin: 'round',
            };
          }}
          onEachFeature={onEachCorriente}
        />
      )}
    </>
  );
};