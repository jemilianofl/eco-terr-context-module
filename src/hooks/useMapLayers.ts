import { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import type { Feature, Point, Polygon, MultiPolygon, Geometry } from 'geojson';
import { queryFgbLayer } from '../utils/fgbReader';
import {
  ECO_LAYERS_CONFIG,
  getColorForVegetation,
  getColorForClimate,
  getColorForEdafologia,
} from '../config/mapConfig';

export interface SentinelMetadata {
  platform?: string;
  date?: string;
}

interface SentinelApiResponse {
  success?: boolean;
  tileUrl?: string;
  metadata?: SentinelMetadata;
}

export interface LayerFeatureProperties {
  polyId?: string;
  _color?: string;
  _title?: string;
  _layerId?: string;
  _type?: string;
  _subtitle?: string;
  NOMBRE?: string;
  NOM_AICA?: string;
  nombre?: string;
  Name?: string;
  NAME?: string;
  NOM?: string;
  SITIO?: string;
  DESCRIPCIO?: string;
  descripcio?: string;
  TIPO_VEG?: string;
  CLAVE?: string;
  TIPO_C?: string;
  CLAVE_WRB?: string;
  GRUPO1?: string;
  N_G1?: string;
  N_CS_G1?: string;
  N_CP_G1?: string;
  TEXTURA?: string;
  TIP_INFO?: string;
  [key: string]: unknown;
}

export type TypedMapFeature = Feature<Geometry, LayerFeatureProperties>;

export const useSentinelData = (
  predioCentroid: Feature<Point> | null,
  targetDate: string | undefined
) => {
  const [sentinelUrl, setSentinelUrl] = useState<string | null>(null);
  const [sentinelMetadata, setSentinelMetadata] = useState<SentinelMetadata | null>(null);
  const [useSentinel, setUseSentinel] = useState<boolean>(true);

  useEffect(() => {
    if (!predioCentroid || !targetDate) return;
    const fetchSentinelData = async () => {
      try {
        const [lng, lat] = predioCentroid.geometry.coordinates;
        const rawBackendUrl: unknown = import.meta.env.VITE_SENTINEL_API_URL;
        const backendUrl =
          typeof rawBackendUrl === 'string' && rawBackendUrl.length > 0
            ? rawBackendUrl
            : 'http://localhost:3000';
        const response = await fetch(
          `${backendUrl}/sentinel/tiles?lat=${lat}&lng=${lng}&date=${targetDate}`
        );
        if (response.ok) {
          const result = (await response.json()) as SentinelApiResponse;
          if (result.success && result.tileUrl) {
            setSentinelUrl(result.tileUrl);
            setSentinelMetadata(result.metadata ?? null);
            setUseSentinel(true);
            return;
          }
        }
        setSentinelUrl(null);
        setSentinelMetadata(null);
        setUseSentinel(false);
      } catch {
        setSentinelUrl(null);
        setSentinelMetadata(null);
        setUseSentinel(false);
      }
    };
    void fetchSentinelData();
  }, [predioCentroid, targetDate]);

  return { sentinelUrl, sentinelMetadata, useSentinel, setUseSentinel };
};

export const useEcoLayers = (buffer10km: Feature<Polygon | MultiPolygon> | null) => {
  const [ecoNearby, setEcoNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!buffer10km) return;
    let isCancelled = false;

    const loadEcoData = async () => {
      setIsLoading(true);
      const [minX, minY, maxX, maxY] = turf.bbox(buffer10km);
      try {
        const results = await Promise.all(
          ECO_LAYERS_CONFIG.map(async (layer): Promise<TypedMapFeature[]> => {
            const raw = await queryFgbLayer(layer.file, { minX, minY, maxX, maxY });
            return raw
              .filter((f) => {
                try {
                  return turf.booleanIntersects(f, buffer10km);
                } catch {
                  return false;
                }
              })
              .map((f): TypedMapFeature => ({
                ...f,
                properties: {
                  ...(f.properties ?? {}),
                  _color: layer.color,
                  _title: layer.title,
                  _layerId: layer.id,
                },
              }));
          })
        );
        if (!isCancelled) setEcoNearby(results.flat());
      } catch (err) {
        console.error('Error R2:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    void loadEcoData();
    return () => {
      isCancelled = true;
    };
  }, [buffer10km]);

  return { ecoNearby, isLoadingEco: isLoading };
};

export const useVegetationLayers = (
  buffer10km: Feature<Polygon | MultiPolygon> | null,
  selectedVegSerie: string
) => {
  const [vegNearby, setVegNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!buffer10km) return;
    let isCancelled = false;

    const loadVegData = async () => {
      setIsLoading(true);
      const [minX, minY, maxX, maxY] = turf.bbox(buffer10km);
      try {
        const raw = await queryFgbLayer(`usv_${selectedVegSerie}.fgb`, {
          minX,
          minY,
          maxX,
          maxY,
        });
        const filtered: TypedMapFeature[] = raw
          .filter((f) => {
            if (!f.geometry) return false;
            try {
              return turf.booleanIntersects(f, buffer10km);
            } catch {
              return false;
            }
          })
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            const rawType = props.DESCRIPCIO ?? props.descripcio ?? props.TIPO_VEG;
            const typeVeg =
              typeof rawType === 'string' && rawType.trim().length > 0
                ? rawType
                : 'Vegetación Indeterminada';
            return {
              ...f,
              properties: {
                ...props,
                _type: typeVeg,
                _color: getColorForVegetation(typeVeg),
              },
            };
          });
        if (!isCancelled) setVegNearby(filtered);
      } catch (err) {
        console.error('Error R2 vegetación:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    void loadVegData();
    return () => {
      isCancelled = true;
    };
  }, [buffer10km, selectedVegSerie]);

  return { vegNearby, isLoadingVeg: isLoading };
};

export const useClimateLayers = (buffer10km: Feature<Polygon | MultiPolygon> | null) => {
  const [climateNearby, setClimateNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!buffer10km) return;
    let isCancelled = false;

    const loadClimateData = async () => {
      setIsLoading(true);
      const [minX, minY, maxX, maxY] = turf.bbox(buffer10km);
      try {
        const raw = await queryFgbLayer('climas.fgb', { minX, minY, maxX, maxY });
        const filtered: TypedMapFeature[] = raw
          .filter((f) => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            if (props.TIPO_C === 'País extranjero' || props.CLAVE === 'P/E') return false;
            try {
              return turf.booleanIntersects(f, buffer10km);
            } catch {
              return false;
            }
          })
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            const clave = typeof props.CLAVE === 'string' ? props.CLAVE.trim() : '';
            const tipoC = typeof props.TIPO_C === 'string' ? props.TIPO_C.trim() : '';

            let label = 'Unidad Climática';
            if (clave && tipoC) {
              label = `${clave} - ${tipoC}`;
            } else if (tipoC) {
              label = tipoC;
            } else if (clave) {
              label = clave;
            }

            return {
              ...f,
              properties: {
                ...props,
                _type: label,
                _color: getColorForClimate(clave, tipoC),
              },
            };
          });
        if (!isCancelled) setClimateNearby(filtered);
      } catch (err) {
        console.error('Error R2 climas:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    void loadClimateData();
    return () => {
      isCancelled = true;
    };
  }, [buffer10km]);

  return { climateNearby, isLoadingClimate: isLoading };
};

export const useEdafologiaLayers = (buffer10km: Feature<Polygon | MultiPolygon> | null) => {
  const [edafologiaNearby, setEdafologiaNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!buffer10km) return;
    let isCancelled = false;

    const loadEdafologiaData = async () => {
      setIsLoading(true);
      const [minX, minY, maxX, maxY] = turf.bbox(buffer10km);
      try {
        const raw = await queryFgbLayer('edafologia.fgb', { minX, minY, maxX, maxY });
        const filtered: TypedMapFeature[] = raw
          .filter((f) => {
            try {
              return turf.booleanIntersects(f, buffer10km);
            } catch {
              return false;
            }
          })
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            const grupo = typeof props.N_G1 === 'string' && props.N_G1 !== 'N' ? props.N_G1.trim() : '';
            const tipInfo = typeof props.TIP_INFO === 'string' ? props.TIP_INFO.trim() : '';
            const claveWrb = typeof props.CLAVE_WRB === 'string' ? props.CLAVE_WRB.trim() : '';

            let soilLabel = 'Unidad Edafológica';
            if (grupo) {
              soilLabel = grupo;
            } else if (tipInfo && tipInfo !== 'UNIDAD EDAFOLOGICA') {
              soilLabel = tipInfo;
            } else if (claveWrb) {
              soilLabel = claveWrb;
            }

            const detalles: string[] = [];
            if (claveWrb) detalles.push(`Clave WRB: ${claveWrb}`);
            if (typeof props.N_CS_G1 === 'string' && props.N_CS_G1 !== 'N') {
              detalles.push(`Calif. Sec.: ${props.N_CS_G1}`);
            }
            if (typeof props.N_CP_G1 === 'string' && props.N_CP_G1 !== 'N') {
              detalles.push(`Calif. Prin.: ${props.N_CP_G1}`);
            }
            if (typeof props.TEXTURA === 'string' && props.TEXTURA !== 'N') {
              detalles.push(`Textura: ${props.TEXTURA}`);
            }

            return {
              ...f,
              properties: {
                ...props,
                _type: soilLabel,
                _subtitle: detalles.join(' | '),
                _color: getColorForEdafologia(soilLabel),
              },
            };
          });
        if (!isCancelled) setEdafologiaNearby(filtered);
      } catch (err) {
        console.error('Error R2 edafología:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    void loadEdafologiaData();
    return () => {
      isCancelled = true;
    };
  }, [buffer10km]);

  return { edafologiaNearby, isLoadingEdafologia: isLoading };
};