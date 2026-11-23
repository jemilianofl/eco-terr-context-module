import { useCallback, useEffect, useMemo, useState } from 'react';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { SatelliteCollectionOption, TemporalSceneItem } from './useMapLayers';
import { getGisBackendUrl } from '../utils/gisApiClient';

/** Peticiones simultáneas al backend (cada año es una consulta a GEE). */
const CONCURRENCY = 3;
/** Buffer alrededor del polígono para dar contexto en la miniatura (el script forense usa 400 m). */
const AOI_BUFFER_KM = 0.4;

export type SeriesBBox = [number, number, number, number];

export interface SeriesScene extends TemporalSceneItem {
  thumbUrl?: string | null;
  bbox?: SeriesBBox | null;
  aoiClearPct?: number | null;
  processingLevel?: string | null;
}

export type SeriesYearStatus = 'pending' | 'loading' | 'ok' | 'empty' | 'error';

export interface SeriesYearItem {
  year: number;
  status: SeriesYearStatus;
  scene: SeriesScene | null;
  error?: string;
}

export function getSeriesYears(collection: SatelliteCollectionOption): number[] {
  const startYear = collection === 'sentinel-2-l2a' ? 2015 : 1984;
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= currentYear; y++) years.push(y);
  return years;
}

async function fetchYear(
  year: number,
  center: [number, number],
  bbox: SeriesBBox,
  collection: SatelliteCollectionOption,
  signal: AbortSignal,
): Promise<Pick<SeriesYearItem, 'status' | 'scene' | 'error'>> {
  const params = new URLSearchParams({
    lat: center[1].toFixed(6),
    lng: center[0].toFixed(6),
    year: String(year),
    collection,
    preset: 'rgb',
    bbox: bbox.map((v) => v.toFixed(6)).join(','),
  });
  const backendUrl = getGisBackendUrl().replace(/\/$/, '');
  const res = await fetch(`${backendUrl}/sentinel/annual?${params.toString()}`, { signal });
  if (res.status === 404) return { status: 'empty', scene: null };
  if (!res.ok) return { status: 'error', scene: null, error: `HTTP ${res.status}` };
  const body = (await res.json()) as { scene?: SeriesScene };
  return body.scene ? { status: 'ok', scene: body.scene } : { status: 'empty', scene: null };
}

/**
 * Serie multitemporal RGB: mejor escena por año sobre el AOI del polígono,
 * cargada de forma progresiva (la galería se va llenando año por año).
 */
type YearResult = Pick<SeriesYearItem, 'status' | 'scene' | 'error'>;

/**
 * Serie multitemporal RGB: mejor escena por año sobre el AOI del polígono,
 * cargada de forma progresiva (la galería se va llenando año por año).
 * El estado de cada año se deriva: solo se escribe estado cuando llega una respuesta.
 */
export function useTemporalSeries(
  polygon: Feature<Polygon | MultiPolygon> | null,
  enabled: boolean,
  collection: SatelliteCollectionOption,
) {
  const [reloadKey, setReloadKey] = useState(0);
  const [results, setResults] = useState<{ key: string; byYear: Record<number, YearResult> }>({
    key: '',
    byYear: {},
  });

  const bbox = useMemo<SeriesBBox | null>(() => {
    if (!polygon) return null;
    try {
      const buffered = turf.buffer(polygon, AOI_BUFFER_KM, { units: 'kilometers' });
      return turf.bbox(buffered ?? polygon) as SeriesBBox;
    } catch {
      return turf.bbox(polygon) as SeriesBBox;
    }
  }, [polygon]);

  const center = useMemo<[number, number] | null>(() => {
    if (!polygon) return null;
    try {
      return turf.centroid(polygon).geometry.coordinates as [number, number];
    } catch {
      return null;
    }
  }, [polygon]);

  const years = useMemo(() => getSeriesYears(collection), [collection]);
  const isActive = enabled && Boolean(bbox) && Boolean(center);
  const requestKey = bbox ? `${collection}|${bbox.join(',')}|${reloadKey}` : '';

  useEffect(() => {
    if (!enabled || !bbox || !center) return;

    const controller = new AbortController();
    const key = `${collection}|${bbox.join(',')}|${reloadKey}`;

    const store = (year: number, result: YearResult) =>
      setResults((prev) => ({
        key,
        byYear: { ...(prev.key === key ? prev.byYear : {}), [year]: result },
      }));

    let cursor = 0;
    const worker = async () => {
      while (cursor < years.length && !controller.signal.aborted) {
        const year = years[cursor++];
        try {
          const result = await fetchYear(year, center, bbox, collection, controller.signal);
          if (!controller.signal.aborted) store(year, result);
        } catch (err) {
          if (controller.signal.aborted) return;
          store(year, {
            status: 'error',
            scene: null,
            error: err instanceof Error ? err.message : 'Error de red',
          });
        }
      }
    };

    void Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    return () => controller.abort();
  }, [enabled, bbox, center, collection, years, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const items = useMemo<SeriesYearItem[]>(() => {
    if (!isActive) return [];
    const byYear = results.key === requestKey ? results.byYear : {};
    return years.map((year) => ({
      year,
      ...(byYear[year] ?? { status: 'loading' as const, scene: null }),
    }));
  }, [isActive, results, requestKey, years]);

  const scenesByYear = useMemo(() => {
    const map = new Map<number, SeriesScene>();
    items.forEach((it) => {
      if (it.status === 'ok' && it.scene) map.set(it.year, it.scene);
    });
    return map;
  }, [items]);

  const availableYears = useMemo<number[]>(
    () => Array.from(scenesByYear.keys()).sort((a, b) => a - b),
    [scenesByYear],
  );

  const progress = useMemo(() => {
    const done = items.filter((it) => it.status !== 'pending' && it.status !== 'loading').length;
    return { done, total: items.length };
  }, [items]);

  return {
    items,
    bbox,
    scenesByYear,
    availableYears,
    progress,
    isLoadingSeries: items.length > 0 && progress.done < progress.total,
    reload,
  };
}
