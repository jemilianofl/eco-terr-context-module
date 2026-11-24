import { useEffect, useState } from 'react';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import parseGeoraster, { type GeoRaster } from 'georaster';

/** Un mismo COG se abre una sola vez por sesión (solo se leen encabezados; los píxeles bajo demanda). */
const georasterCache = new Map<string, Promise<GeoRaster>>();

const loadGeoraster = (url: string): Promise<GeoRaster> => {
  let pending = georasterCache.get(url);
  if (!pending) {
    pending = parseGeoraster(url);
    georasterCache.set(url, pending);
    pending.catch(() => georasterCache.delete(url));
  }
  return pending;
};

/** Abre un Cloud Optimized GeoTIFF remoto; con url = null no hace nada. */
export function useGeoraster(url: string | null) {
  const [state, setState] = useState<{ url: string | null; georaster: GeoRaster | null; error: string | null }>({
    url: null,
    georaster: null,
    error: null,
  });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadGeoraster(url)
      .then((georaster) => {
        if (!cancelled) setState({ url, georaster, error: null });
      })
      .catch((err: unknown) => {
        console.error('No se pudo abrir el raster', url, err);
        if (!cancelled) setState({ url, georaster: null, error: 'No se pudo cargar el raster de integridad.' });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = url !== null && state.url === url;
  return {
    georaster: current ? state.georaster : null,
    error: current ? state.error : null,
    isLoading: url !== null && !current,
  };
}

export interface RasterStats {
  mean: number;
  min: number;
  max: number;
  /** Celdas de 250 m (aprox.) que caen dentro del polígono. */
  cells: number;
  /** true si el polígono es más chico que una celda y se usó el valor del centroide. */
  fromCentroid: boolean;
}

/** Máximo de celdas por lado al muestrear (evita descargas grandes en polígonos enormes). */
const MAX_SAMPLE_SIDE = 200;

const isValid = (v: number, noData: number | null) =>
  Number.isFinite(v) && v !== noData && v > -1 && v < 2;

/** Estadísticas del índice dentro del polígono inspeccionado (valores recortados a 0–1). */
export function useRasterStats(georaster: GeoRaster | null, polygon: Feature<Polygon | MultiPolygon> | null) {
  const [result, setResult] = useState<{
    key: string;
    stats: RasterStats | null;
    error: string | null;
  } | null>(null);

  const key = georaster && polygon ? JSON.stringify(turf.bbox(polygon)) : '';

  useEffect(() => {
    if (!georaster || !polygon) return;
    let cancelled = false;

    const compute = async (): Promise<RasterStats | null> => {
      const [minX, minY, maxX, maxY] = turf.bbox(polygon);
      const sw = L.CRS.EPSG3857.project(L.latLng(minY, minX));
      const ne = L.CRS.EPSG3857.project(L.latLng(maxY, maxX));
      const left = sw.x;
      const right = ne.x;
      const bottom = sw.y;
      const top = ne.y;
      const pixel = Math.abs(georaster.pixelWidth) || 250;
      const width = Math.min(MAX_SAMPLE_SIDE, Math.max(1, Math.ceil((right - left) / pixel)));
      const height = Math.min(MAX_SAMPLE_SIDE, Math.max(1, Math.ceil((top - bottom) / pixel)));

      const values = await georaster.getValues({ left, right, top, bottom, width, height, resampleMethod: 'nearest' });
      const band = values[0] ?? [];
      const inside: number[] = [];
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const v = band[r]?.[c];
          if (v === undefined || !isValid(v, georaster.noDataValue)) continue;
          const x = left + ((c + 0.5) * (right - left)) / width;
          const y = top - ((r + 0.5) * (top - bottom)) / height;
          const ll = L.CRS.EPSG3857.unproject(L.point(x, y));
          if (turf.booleanPointInPolygon([ll.lng, ll.lat], polygon)) inside.push(Math.min(1, Math.max(0, v)));
        }
      }

      let fromCentroid = false;
      if (inside.length === 0) {
        // Polígono más chico que una celda: se toma el valor bajo el centroide
        const [lng, lat] = turf.centroid(polygon).geometry.coordinates;
        const p = L.CRS.EPSG3857.project(L.latLng(lat, lng));
        const one = await georaster.getValues({
          left: p.x - pixel / 2,
          right: p.x + pixel / 2,
          top: p.y + pixel / 2,
          bottom: p.y - pixel / 2,
          width: 1,
          height: 1,
          resampleMethod: 'nearest',
        });
        const v = one[0]?.[0]?.[0];
        if (v === undefined || !isValid(v, georaster.noDataValue)) return null;
        inside.push(Math.min(1, Math.max(0, v)));
        fromCentroid = true;
      }

      const sum = inside.reduce((a, b) => a + b, 0);
      return {
        mean: sum / inside.length,
        min: Math.min(...inside),
        max: Math.max(...inside),
        cells: inside.length,
        fromCentroid,
      };
    };

    compute()
      .then((stats) => {
        if (!cancelled) setResult({ key, stats, error: null });
      })
      .catch((err: unknown) => {
        console.error('Error calculando integridad en el polígono:', err);
        if (!cancelled) setResult({ key, stats: null, error: 'No se pudo calcular el índice en el polígono.' });
      });
    return () => {
      cancelled = true;
    };
  }, [georaster, polygon, key]);

  const current = result !== null && result.key === key && key !== '';
  return {
    stats: current ? result.stats : null,
    error: current ? result.error : null,
    isLoading: key !== '' && !current,
  };
}
