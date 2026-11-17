import { GeoJSON, Pane, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, Geometry } from 'geojson';
import { useMemo } from 'react';
import type {
  TypedMapFeature,
  LayerFeatureProperties as LayerFeatureProps,
} from '../../hooks/useMapLayers';
import {
  ECO_LAYERS_CONFIG,
  getStrahlerStyle,
  getEcoSiteName,
} from '../../config/mapConfig';

interface UserPolygonLayerProps {
  geoJsonData: FeatureCollection;
  interactive?: boolean;
}

export const UserPolygonLayer = ({
  geoJsonData,
  interactive = true,
}: UserPolygonLayerProps) => {
  const map = useMapEvents({
    click(e) {
      if (!interactive) return;
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
  const layerKey = `user-layer-${interactive ? 'main' : 'mini'}-${geoJsonData.features.length}-${firstPolyId}`;

  return (
    <GeoJSON
      key={layerKey}
      data={geoJsonData}
      interactive={interactive}
      filter={(feature) =>
        Boolean(feature.geometry) &&
        feature.geometry.type !== 'Point' &&
        feature.geometry.type !== 'MultiPoint'
      }
      style={() => ({
        color: '#ff0000',
        weight: interactive ? 3 : 2,
        fill: !interactive,
        fillColor: '#ff0000',
        fillOpacity: interactive ? 0 : 0.35,
        lineJoin: 'round',
        lineCap: 'round',
      })}
    />
  );
};

interface EcoLayerProps {
  ecoNearby: TypedMapFeature[];
  interactive?: boolean;
}

export const EcoLayer = ({ ecoNearby, interactive = true }: EcoLayerProps) => {
  const map = useMapEvents({
    click(e) {
      if (!interactive) return;
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      for (const f of ecoNearby) {
        if (
          (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
          turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)
        ) {
          const title = f.properties?._title ?? 'Área Protegida';
          const name = getEcoSiteName(f.properties) ?? 'Área Protegida';
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

  const layerKey = `eco-layer-${interactive ? 'main' : 'mini'}-${data.features.length}-${data.features[0]?.properties?._layerId ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      interactive={interactive}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        const layerCfg = ECO_LAYERS_CONFIG.find((c) => c.id === props?._layerId);
        return {
          color: props?._color,
          weight: interactive ? 2.5 : 1.5,
          dashArray: layerCfg?.dashArray,
          fillColor: props?._color,
          fillOpacity: interactive ? 0.35 : 0.45,
        };
      }}
    />
  );
};

interface VegLayerProps {
  vegNearby: TypedMapFeature[];
  interactive?: boolean;
}

export const VegLayer = ({ vegNearby, interactive = true }: VegLayerProps) => {
  const map = useMapEvents({
    click(e) {
      if (!interactive) return;
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

  const layerKey = `veg-layer-${interactive ? 'main' : 'mini'}-${data.features.length}-${data.features[0]?.properties?._type ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      interactive={interactive}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        return {
          color: props?._color,
          weight: interactive ? 1.8 : 1,
          fillColor: props?._color,
          fillOpacity: interactive ? 0.52 : 0.58,
        };
      }}
    />
  );
};

interface ClimateLayerProps {
  climateNearby: TypedMapFeature[];
  interactive?: boolean;
}

export const ClimateLayer = ({ climateNearby, interactive = true }: ClimateLayerProps) => {
  const map = useMapEvents({
    click(e) {
      if (!interactive) return;
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

  const layerKey = `climate-layer-${interactive ? 'main' : 'mini'}-${data.features.length}-${data.features[0]?.properties?._type ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      interactive={interactive}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        return {
          color: props?._color,
          weight: interactive ? 2.0 : 1,
          fillColor: props?._color,
          fillOpacity: interactive ? 0.5 : 0.55,
        };
      }}
    />
  );
};

interface EdafologiaLayerProps {
  edafologiaNearby: TypedMapFeature[];
  interactive?: boolean;
}

export const EdafologiaLayer = ({
  edafologiaNearby,
  interactive = true,
}: EdafologiaLayerProps) => {
  const map = useMapEvents({
    click(e) {
      if (!interactive) return;
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

  const layerKey = `edafologia-layer-${interactive ? 'main' : 'mini'}-${data.features.length}-${data.features[0]?.properties?._type ?? '0'}`;

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      interactive={interactive}
      style={(f) => {
        const props = f?.properties as LayerFeatureProps | undefined;
        return {
          color: props?._color,
          weight: interactive ? 1.8 : 1,
          fillColor: props?._color,
          fillOpacity: interactive ? 0.52 : 0.58,
        };
      }}
    />
  );
};

interface HidrologiaLayerProps {
  cuencasNearby: TypedMapFeature[];
  subcuencasNearby: TypedMapFeature[];
  cuerposAguaNearby: TypedMapFeature[];
  corrientesNearby: TypedMapFeature[];
  microcuencaData?: FeatureCollection | null;
  interactive?: boolean;
}

export const HidrologiaLayer = ({
  cuencasNearby,
  subcuencasNearby,
  cuerposAguaNearby,
  corrientesNearby,
  microcuencaData,
  interactive = true,
}: HidrologiaLayerProps) => {
  const cuencasFc = useMemo<FeatureCollection<Geometry, LayerFeatureProps>>(() => {
    const valid = (cuencasNearby ?? []).filter((f) => Boolean(f?.geometry));
    return valid.length ? turf.featureCollection(valid) : { type: 'FeatureCollection', features: [] };
  }, [cuencasNearby]);

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

  const onEachCuenca = (feature: Feature<Geometry, LayerFeatureProps>, layer: L.Layer) => {
    const p = feature.properties ?? {};
    const nombre = typeof p._type === 'string' ? p._type : 'Cuenca Hidrográfica';
    layer.bindPopup(
      `<div style="font-size:0.82rem; min-width:190px;">
        <strong style="color:#6d28d9;">Cuenca Hidrográfica</strong>
        <div style="border-top:1px solid #ccc; margin:4px 0;"></div>
        <strong>Nombre:</strong> ${nombre}
      </div>`
    );
  };

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

  const modeKey = interactive ? 'main' : 'mini';

  return (
    <>
      {cuencasFc.features.length > 0 && (
        <GeoJSON
          key={`cuencas-cna-${modeKey}-${cuencasFc.features.length}`}
          data={cuencasFc}
          interactive={interactive}
          style={() => ({
            color: '#6d28d9',
            weight: interactive ? 3 : 2,
            dashArray: '10, 5, 2, 5',
            fillColor: '#ede9fe',
            fillOpacity: 0.14,
          })}
          onEachFeature={interactive ? onEachCuenca : undefined}
        />
      )}

      {subcuencasFc.features.length > 0 && (
        <GeoJSON
          key={`subcuencas-50k-${modeKey}-${subcuencasFc.features.length}`}
          data={subcuencasFc}
          interactive={interactive}
          style={() => ({
            color: '#78350f',
            weight: interactive ? 2.2 : 1.5,
            dashArray: '6, 4',
            fillColor: '#d6c7a9',
            fillOpacity: microcuencaData?.features?.length ? 0.12 : 0.25,
          })}
          onEachFeature={interactive ? onEachSubcuenca : undefined}
        />
      )}

      {microcuencaData && microcuencaData.features.length > 0 && (
        <GeoJSON
          key={`microcuenca-siatl-${modeKey}-${microcuencaData.features.length}`}
          data={microcuencaData}
          interactive={interactive}
          filter={(feature) =>
            Boolean(feature.geometry) &&
            feature.geometry.type !== 'Point' &&
            feature.geometry.type !== 'MultiPoint'
          }
          style={() => ({
            color: '#5c4033',
            weight: interactive ? 2.2 : 1.5,
            fillColor: '#c8b598',
            fillOpacity: 0.48,
          })}
          onEachFeature={interactive ? onEachMicrocuenca : undefined}
        />
      )}

      {cuerposAguaFc.features.length > 0 && (
        <GeoJSON
          key={`cuerpos-agua-50k-${modeKey}-${cuerposAguaFc.features.length}`}
          data={cuerposAguaFc}
          interactive={interactive}
          style={() => ({
            color: '#0284c7',
            weight: interactive ? 1.5 : 1,
            fillColor: '#38bdf8',
            fillOpacity: 0.65,
          })}
          onEachFeature={interactive ? onEachCuerpoAgua : undefined}
        />
      )}

      {corrientesFc.features.length > 0 && (
        <Pane name={`corrientes-pane-${modeKey}`} style={{ zIndex: 460 }}>
          <GeoJSON
            key={`corrientes-halo-${modeKey}-${corrientesFc.features.length}`}
            data={corrientesFc}
            interactive={false}
            style={(f) => {
              const props = f?.properties as LayerFeatureProps | undefined;
              const style = getStrahlerStyle(props?.ORDER_1);
              return {
                color: '#ffffff',
                weight: interactive ? style.weight + 2.2 : 2.2,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              };
            }}
          />
          <GeoJSON
            key={`corrientes-50k-${modeKey}-${corrientesFc.features.length}`}
            data={corrientesFc}
            interactive={interactive}
            style={(f) => {
              const props = f?.properties as LayerFeatureProps | undefined;
              const style = getStrahlerStyle(props?.ORDER_1);
              return {
                color: style.color,
                weight: interactive ? style.weight : Math.max(1.2, style.weight * 0.45),
                opacity: style.opacity,
                lineCap: 'round',
                lineJoin: 'round',
              };
            }}
            onEachFeature={interactive ? onEachCorriente : undefined}
          />
        </Pane>
      )}
    </>
  );
};