import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
} from 'geojson';
import type { TypedMapFeature } from '../hooks/useMapLayers';

export type LayerFilterMode = 'intersect' | 'buffer10km';

export interface DictamenSpatialSummary {
  areaTotalM2: number;
  areaTotalHa: number;
  ecologiaPredio: {
    layerId: string;
    title: string;
    siteName: string;
  }[];
  vegetacionPredio: string[];
  climasPredio: string[];
  edafologiaPredio: {
    grupo: string;
    claveWrb?: string;
    textura?: string;
    profundidadEstimada: string;
  }[];
  hidrologiaPredio: {
    regionHidrologica?: string;
    cuenca?: string;
    subcuenca?: string;
    claveSubcuenca?: string;
    ordenStrahlerMaximo: number | null;
    corrientesCercanasCount: number;
    cuerposAguaCount: number;
  };
}

export interface GisContextApiResponse {
  success: boolean;
  cached: boolean;
  filterMode: LayerFilterMode;
  layers: {
    eco?: TypedMapFeature[];
    veg?: TypedMapFeature[];
    climate?: TypedMapFeature[];
    edafologia?: TypedMapFeature[];
    hidrologia?: {
      cuencas: TypedMapFeature[];
      subcuencas: TypedMapFeature[];
      cuerposAgua: TypedMapFeature[];
      corrientes: TypedMapFeature[];
    };
  };
  summary: DictamenSpatialSummary;
}

export interface ParsedPolygonSummary {
  polyId: string;
  name: string;
  areaM2: number;
  areaHa: number;
}

export interface ParsePolygonApiResponse {
  success: boolean;
  featureCollection: FeatureCollection;
  polygons: ParsedPolygonSummary[];
  totalAreaM2: number;
  totalAreaHa: number;
}

export class GisBackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GisBackendUnavailableError';
  }
}

export function getGisBackendUrl(): string {
  const rawGisUrl: unknown = import.meta.env.VITE_GIS_API_URL;
  if (typeof rawGisUrl === 'string' && rawGisUrl.trim().length > 0) {
    return rawGisUrl.trim().replace(/\/$/, '');
  }

  const rawSentinelUrl: unknown = import.meta.env.VITE_SENTINEL_API_URL;
  if (typeof rawSentinelUrl === 'string' && rawSentinelUrl.trim().length > 0) {
    return rawSentinelUrl.trim().replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

const inFlightContextRequests = new Map<string, Promise<GisContextApiResponse>>();

export async function fetchGisContextFromBackend(params: {
  geometry: Feature<Polygon | MultiPolygon>;
  filterMode: LayerFilterMode;
  planos: number[];
  vegSerie?: string;
}): Promise<GisContextApiResponse> {
  const baseUrl = getGisBackendUrl();
  const dedupKey = JSON.stringify({
    coords: params.geometry.geometry,
    filterMode: params.filterMode,
    planos: params.planos,
    vegSerie: params.vegSerie ?? 'serie_7',
  });

  const existingPromise = inFlightContextRequests.get(dedupKey);
  if (existingPromise) {
    return existingPromise;
  }

  const requestPromise = (async (): Promise<GisContextApiResponse> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${baseUrl}/gis/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          geometry: params.geometry,
          filterMode: params.filterMode,
          planos: params.planos,
          vegSerie: params.vegSerie,
          clipToBbox: true,
        }),
      });

      if (!response.ok) {
        throw new GisBackendUnavailableError(
          `El servidor GIS respondió con estado HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as GisContextApiResponse;
      if (!data?.success || !data?.layers) {
        throw new GisBackendUnavailableError('Respuesta GIS inválida del servidor');
      }
      return data;
    } catch (error) {
      if (error instanceof GisBackendUnavailableError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new GisBackendUnavailableError(`Backend GIS no disponible: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
      inFlightContextRequests.delete(dedupKey);
    }
  })();

  inFlightContextRequests.set(dedupKey, requestPromise);
  return requestPromise;
}

export async function parseSpatialFileViaBackend(
  file: File,
): Promise<ParsePolygonApiResponse> {
  const baseUrl = getGisBackendUrl();
  const formData = new FormData();
  formData.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${baseUrl}/gis/parse-polygon`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (response.status === 400) {
      const errorBody = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        errorBody?.message ?? 'El archivo espacial no tiene un formato válido.',
      );
    }

    if (!response.ok) {
      throw new GisBackendUnavailableError(
        `Error del servidor al parsear archivo (${response.status})`,
      );
    }

    const result = (await response.json()) as ParsePolygonApiResponse;
    if (!result?.success || !result?.featureCollection) {
      throw new GisBackendUnavailableError('Respuesta de parseo inválida');
    }

    return result;
  } catch (error) {
    if (error instanceof GisBackendUnavailableError) throw error;
    if (error instanceof Error && !(error instanceof TypeError) && error.name !== 'AbortError') {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new GisBackendUnavailableError(`Backend GIS no disponible: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}