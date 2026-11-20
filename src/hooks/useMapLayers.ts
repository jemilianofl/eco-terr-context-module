import { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import type { Feature, Point, Polygon, MultiPolygon, Geometry } from 'geojson';
import { queryFgbLayer } from '../utils/fgbReader';
import {
  fetchGisContextFromBackend,
  getGisBackendUrl,
  type LayerFilterMode,
} from '../utils/gisApiClient';
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
  _siteName?: string;
  _type?: string;
  _subtitle?: string;
  _weight?: number;
  _opacity?: number;
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
  GRUPO2?: string;
  GRUPO3?: string;
  N_G1?: string;
  N_G2?: string;
  N_G3?: string;
  N_CS_G1?: string;
  N_CP_G1?: string;
  CLASE_TEX?: number | string;
  TEXTURA?: string;
  F_SUPERF?: string;
  FRUDICA?: string;
  TIP_INFO?: string;
  [key: string]: unknown;
  // Campos SIATL 1:50,000 (Subcuencas, Cuerpos de Agua y Red Hidrográfica)
  CVE_SUBCUE?: string;
  CVE_RH?: string;
  RH?: string;
  CVE_CUE?: string;
  CUENCA?: string;
  CVE_SUBC?: string;
  SUBCUENCA?: string;
  AREA_KM2?: number | string;
  PERIMETRO?: number | string;
  TIPO?: string;
  DRENAJE1?: string;
  CONDICION?: string;
  ENTIDAD?: string;
  ORDER_1?: number | string;
  LEVEL_1?: number | string;
  LENGTHM?: number | string;
  ARBSUM_1?: number | string;
  PATHL_1?: number | string;
}

export type TypedMapFeature = Feature<Geometry, LayerFeatureProperties>;

const EMPTY_FEATURES: TypedMapFeature[] = [];

function resolveFallbackFilterGeometry(
  predioGeometry: Feature<Polygon | MultiPolygon>,
  filterMode: LayerFilterMode,
): Feature<Polygon | MultiPolygon> {
  if (filterMode === 'intersect') return predioGeometry;
  return turf.buffer(predioGeometry, 10, { units: 'kilometers' }) ?? predioGeometry;
}


export const useSentinelData = (
  predioCentroid: Feature<Point> | null,
  targetDate: string | undefined,
) => {
  const [sentinelUrl, setSentinelUrl] = useState<string | null>(null);
  const [sentinelMetadata, setSentinelMetadata] = useState<SentinelMetadata | null>(null);
  const [useSentinel, setUseSentinel] = useState<boolean>(true);

  useEffect(() => {
    if (!predioCentroid || !targetDate) return;
    const fetchSentinelData = async () => {
      try {
        const [lng, lat] = predioCentroid.geometry.coordinates;
        const backendUrl = getGisBackendUrl();
        const response = await fetch(
          `${backendUrl}/sentinel/tiles?lat=${lat}&lng=${lng}&date=${targetDate}`,
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

export type SpectralPreset = 'rgb' | 'nir' | 'swir' | 'ndvi';
export type SatelliteCollectionOption = 'sentinel-2-l2a' | 'landsat-c2-l2';

export interface TemporalSceneItem {
  id: string;
  year: number;
  date: string;
  cloudCover: number;
  platform: string;
  collection: SatelliteCollectionOption;
  tileUrl: string;
}

interface AnnualApiResponse {
  scene?: TemporalSceneItem;
}

interface AnnualApiError {
  message?: string;
}

export function useTemporalImagery(
  centroid: Feature<Point> | null,
  enabled: boolean,
  params: {
    year: number;
    collection: SatelliteCollectionOption;
    preset: SpectralPreset;
  },
) {
  const [activeScene, setActiveScene] = useState<TemporalSceneItem | null>(null);
  const [isLoadingTemporal, setIsLoadingTemporal] = useState<boolean>(false);
  const [temporalError, setTemporalError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !centroid || !params.year) return;

    const controller = new AbortController();
    const [lng, lat] = centroid.geometry.coordinates;

    const fetchAnnual = async () => {
      setIsLoadingTemporal(true);
      setTemporalError(null);
      try {
        const apiBase =
          (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
        const qs = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          year: String(params.year),
          collection: params.collection,
          preset: params.preset,
        });

        const res = await fetch(`${apiBase}/sentinel/annual?${qs.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as AnnualApiError;
          throw new Error(errBody.message ?? `Sin imágenes disponibles para el año ${params.year}.`);
        }

        const data = (await res.json()) as AnnualApiResponse;
        setActiveScene(data.scene ?? null);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setActiveScene(null);
        setTemporalError(err instanceof Error ? err.message : 'Error consultando archivo satelital.');
      } finally {
        setIsLoadingTemporal(false);
      }
    };

    void fetchAnnual();
    return () => controller.abort();
  }, [enabled, centroid, params.year, params.collection, params.preset]);

  return {
    activeScene,
    isLoadingTemporal,
    temporalError,
  };
}

export const useEcoLayers = (
  predioGeometry: Feature<Polygon | MultiPolygon> | null,
  filterMode: LayerFilterMode,
) => {
  const [ecoNearby, setEcoNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!predioGeometry) return;
    let isCancelled = false;

    const loadEcoData = async () => {
      setIsLoading(true);
      try {
        const backendRes = await fetchGisContextFromBackend({
          geometry: predioGeometry,
          filterMode,
          planos: [2],
        });
        if (!isCancelled && backendRes.layers.eco) {
          setEcoNearby(backendRes.layers.eco);
          return;
        }
      } catch {
        /* Respaldo directo a R2 si el backend no está disponible */
      }

      try {
        const targetGeom = resolveFallbackFilterGeometry(predioGeometry, filterMode);
        const [minX, minY, maxX, maxY] = turf.bbox(targetGeom);
        const results = await Promise.all(
          ECO_LAYERS_CONFIG.map(async (layer): Promise<TypedMapFeature[]> => {
            const raw = await queryFgbLayer(layer.file, { minX, minY, maxX, maxY });
            return raw
              .filter((f) => {
                try {
                  return turf.booleanIntersects(f, targetGeom);
                } catch {
                  return false;
                }
              })
              .map(
                (f): TypedMapFeature => ({
                  ...f,
                  properties: {
                    ...(f.properties ?? {}),
                    _color: layer.color,
                    _title: layer.title,
                    _layerId: layer.id,
                  },
                }),
              );
          }),
        );
        if (!isCancelled) setEcoNearby(results.flat());
      } catch (err) {
        console.error('Error R2 ecología:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void loadEcoData().finally(() => {
      if (!isCancelled) setIsLoading(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [predioGeometry, filterMode]);

  return {
    ecoNearby: predioGeometry ? ecoNearby : EMPTY_FEATURES,
    isLoadingEco: Boolean(predioGeometry) && isLoading,
  };
};

export const useVegetationLayers = (
  predioGeometry: Feature<Polygon | MultiPolygon> | null,
  filterMode: LayerFilterMode,
  selectedVegSerie: string,
) => {
  const [vegNearby, setVegNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!predioGeometry) return;
    let isCancelled = false;

    const loadVegData = async () => {
      setIsLoading(true);
      try {
        const backendRes = await fetchGisContextFromBackend({
          geometry: predioGeometry,
          filterMode,
          planos: [3],
          vegSerie: selectedVegSerie,
        });
        if (!isCancelled && backendRes.layers.veg) {
          setVegNearby(backendRes.layers.veg);
          return;
        }
      } catch {
        /* Respaldo directo a R2 si el backend no está disponible */
      }

      try {
        const targetGeom = resolveFallbackFilterGeometry(predioGeometry, filterMode);
        const [minX, minY, maxX, maxY] = turf.bbox(targetGeom);
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
              return turf.booleanIntersects(f, targetGeom);
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

    void loadVegData().finally(() => {
      if (!isCancelled) setIsLoading(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [predioGeometry, filterMode, selectedVegSerie]);

  return {
    vegNearby: predioGeometry ? vegNearby : EMPTY_FEATURES,
    isLoadingVeg: Boolean(predioGeometry) && isLoading,
  };
};

export const useClimateLayers = (
  predioGeometry: Feature<Polygon | MultiPolygon> | null,
  filterMode: LayerFilterMode,
) => {
  const [climateNearby, setClimateNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!predioGeometry) return;
    let isCancelled = false;

    const loadClimateData = async () => {
      setIsLoading(true);
      try {
        const backendRes = await fetchGisContextFromBackend({
          geometry: predioGeometry,
          filterMode,
          planos: [4],
        });
        if (!isCancelled && backendRes.layers.climate) {
          setClimateNearby(backendRes.layers.climate);
          return;
        }
      } catch {
        /* Respaldo directo a R2 si el backend no está disponible */
      }

      try {
        const targetGeom = resolveFallbackFilterGeometry(predioGeometry, filterMode);
        const [minX, minY, maxX, maxY] = turf.bbox(targetGeom);
        const raw = await queryFgbLayer('climas.fgb', { minX, minY, maxX, maxY });
        const filtered: TypedMapFeature[] = raw
          .filter((f) => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            if (props.TIPO_C === 'País extranjero' || props.CLAVE === 'P/E') return false;
            try {
              return turf.booleanIntersects(f, targetGeom);
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

    void loadClimateData().finally(() => {
      if (!isCancelled) setIsLoading(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [predioGeometry, filterMode]);

  return {
    climateNearby: predioGeometry ? climateNearby : EMPTY_FEATURES,
    isLoadingClimate: Boolean(predioGeometry) && isLoading,
  };
};

const FASES_SUPERFICIALES: Record<string, string> = {
  L: 'Somero (< 50 cm, fase lítica - roca continua)',
  PL: 'Somero (< 50 cm, fase paralítica - roca blanda)',
  PD: 'Somero (< 50 cm, fase petrodúrica - tepetate)',
  PC: 'Somero (< 50 cm, fase petrocálcica - caliche)',
  PG: 'Somero (< 50 cm, fase petrogypsica - yeso)',
};

const inferirProfundidadEdafica = (props: LayerFeatureProperties): string => {
  const grupo = typeof props.N_G1 === 'string' ? props.N_G1.toUpperCase() : '';
  if (grupo.includes('LEPTOSOL') || props.GRUPO1 === 'LP') {
    return 'Muy somero (≤ 25 cm, por grupo Leptosol)';
  }

  const fase = typeof props.F_SUPERF === 'string' ? props.F_SUPERF.trim().toUpperCase() : 'N';
  if (fase && fase !== 'N') {
    return FASES_SUPERFICIALES[fase] ?? `Limitada (< 50 cm, fase ${fase})`;
  }

  const calificadores = `${String(props.N_CP_G1 ?? '')} ${String(props.N_CS_G1 ?? '')}`.toLowerCase();
  if (calificadores.includes('epiléptic') || calificadores.includes('epileptic')) {
    return '25 a 50 cm (calificador Epiléptico)';
  }
  if (calificadores.includes('endoléptic') || calificadores.includes('endoleptic')) {
    return '50 a 100 cm (calificador Endoléptico)';
  }
  if (calificadores.includes('léptic') || calificadores.includes('leptic')) {
    return '25 a 100 cm (calificador Léptico)';
  }

  return 'Sin limitante superficial (> 50 cm)';
};

export const useEdafologiaLayers = (
  predioGeometry: Feature<Polygon | MultiPolygon> | null,
  filterMode: LayerFilterMode,
) => {
  const [edafologiaNearby, setEdafologiaNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!predioGeometry) return;
    let isCancelled = false;

    const loadEdafologiaData = async () => {
      setIsLoading(true);
      try {
        const backendRes = await fetchGisContextFromBackend({
          geometry: predioGeometry,
          filterMode,
          planos: [5],
        });
        if (!isCancelled && backendRes.layers.edafologia) {
          setEdafologiaNearby(backendRes.layers.edafologia);
          return;
        }
      } catch {
        /* Respaldo directo a R2 si el backend no está disponible */
      }

      try {
        const targetGeom = resolveFallbackFilterGeometry(predioGeometry, filterMode);
        const [minX, minY, maxX, maxY] = turf.bbox(targetGeom);
        const raw = await queryFgbLayer('edafologia.fgb', { minX, minY, maxX, maxY });
        const filtered: TypedMapFeature[] = raw
          .filter((f) => {
            if (!f.geometry) return false;
            try {
              return turf.booleanIntersects(f, targetGeom);
            } catch {
              return false;
            }
          })
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            const grupo1 =
              typeof props.N_G1 === 'string' && props.N_G1 !== 'N' ? props.N_G1.trim() : '';
            const tipInfo = typeof props.TIP_INFO === 'string' ? props.TIP_INFO.trim() : '';
            const claveWrb =
              typeof props.CLAVE_WRB === 'string' ? props.CLAVE_WRB.trim() : '';

            let soilLabel = 'Unidad Edafológica';
            if (grupo1) {
              soilLabel = grupo1;
            } else if (tipInfo && tipInfo !== 'UNIDAD EDAFOLOGICA') {
              soilLabel = tipInfo;
            } else if (claveWrb) {
              soilLabel = claveWrb;
            }

            const secundarios = [props.N_G2, props.N_G3]
              .filter((g): g is string => typeof g === 'string' && g.trim() !== '' && g !== 'N')
              .map((g) => g.trim());

            const detalles: string[] = [];
            if (claveWrb) detalles.push(`<strong>Clave WRB:</strong> ${claveWrb}`);
            if (secundarios.length > 0) {
              detalles.push(`<strong>Suelos asociados:</strong> ${secundarios.join(', ')}`);
            }
            if (typeof props.TEXTURA === 'string' && props.TEXTURA !== 'N') {
              const codTex =
                props.CLASE_TEX !== undefined && props.CLASE_TEX !== 'N'
                  ? ` (Clase ${String(props.CLASE_TEX)})`
                  : '';
              detalles.push(`<strong>Clase textural:</strong> ${props.TEXTURA}${codTex}`);
            }
            detalles.push(`<strong>Profundidad est.:</strong> ${inferirProfundidadEdafica(props)}`);

            const califs = [props.N_CP_G1, props.N_CS_G1]
              .filter((c): c is string => typeof c === 'string' && c.trim() !== '' && c !== 'N')
              .map((c) => c.trim());
            if (califs.length > 0) {
              detalles.push(`<strong>Calificadores:</strong> ${califs.join(', ')}`);
            }
            if (typeof props.FRUDICA === 'string' && props.FRUDICA !== 'N') {
              detalles.push(`<strong>Fase rúdica:</strong> ${props.FRUDICA}`);
            }

            return {
              ...f,
              properties: {
                ...props,
                _type: soilLabel,
                _subtitle: detalles.join('<br/>'),
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

    void loadEdafologiaData().finally(() => {
      if (!isCancelled) setIsLoading(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [predioGeometry, filterMode]);

  return {
    edafologiaNearby: predioGeometry ? edafologiaNearby : EMPTY_FEATURES,
    isLoadingEdafologia: Boolean(predioGeometry) && isLoading,
  };
};

export const useHidrologiaLayers = (
  predioGeometry: Feature<Polygon | MultiPolygon> | null,
  filterMode: LayerFilterMode,
) => {
  const [cuencasNearby, setCuencasNearby] = useState<TypedMapFeature[]>([]);
  const [subcuencasNearby, setSubcuencasNearby] = useState<TypedMapFeature[]>([]);
  const [cuerposAguaNearby, setCuerposAguaNearby] = useState<TypedMapFeature[]>([]);
  const [corrientesNearby, setCorrientesNearby] = useState<TypedMapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!predioGeometry) return;
    let isCancelled = false;

    const loadHidrologiaData = async () => {
      setIsLoading(true);
      try {
        const backendRes = await fetchGisContextFromBackend({
          geometry: predioGeometry,
          filterMode,
          planos: [6],
        });
        if (!isCancelled && backendRes.layers.hidrologia) {
          setCuencasNearby(backendRes.layers.hidrologia.cuencas);
          setSubcuencasNearby(backendRes.layers.hidrologia.subcuencas);
          setCuerposAguaNearby(backendRes.layers.hidrologia.cuerposAgua);
          setCorrientesNearby(backendRes.layers.hidrologia.corrientes);
          return;
        }
      } catch {
        /* Respaldo directo a R2 si el backend no está disponible */
      }

      try {
        const targetGeom = resolveFallbackFilterGeometry(predioGeometry, filterMode);
        const [minX, minY, maxX, maxY] = turf.bbox(targetGeom);
        const rect = { minX, minY, maxX, maxY };

        const [rawCuencas, rawSubcuencas, rawCuerposAgua, rawCorrientes] = await Promise.all([
          queryFgbLayer('cuencas_cna.fgb', rect),
          queryFgbLayer('subcuencas_50k.fgb', rect),
          queryFgbLayer('cuerpos_agua_50k.fgb', rect),
          queryFgbLayer('red_hidrografica_50k.fgb', rect),
        ]);

        const intersectsGeometry = (f: Feature): boolean => {
          if (!f.geometry) return false;
          try {
            return turf.booleanIntersects(f, targetGeom);
          } catch {
            return false;
          }
        };

        const filteredCuencas = rawCuencas
          .filter(intersectsGeometry)
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            const rawName = props.NOM_CUENCA ?? props.CUENCA ?? props.NOMBRE ?? props.NOM_CUE;
            const nombreCuenca =
              typeof rawName === 'string' && rawName.trim().length > 0
                ? rawName.trim()
                : 'Cuenca Hidrográfica';
            return {
              ...f,
              properties: {
                ...props,
                _type: nombreCuenca,
                _color: '#6d28d9',
              },
            };
          });

        const filteredSubcuencas = rawSubcuencas
          .filter(intersectsGeometry)
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            const nombreSubc =
              typeof props.SUBCUENCA === 'string' ? props.SUBCUENCA.trim() : 'Subcuenca';
            return {
              ...f,
              properties: {
                ...props,
                _type: nombreSubc,
                _color: '#78350f',
              },
            };
          });

        const filteredCuerposAgua = rawCuerposAgua
          .filter(intersectsGeometry)
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            const cond =
              typeof props.CONDICION === 'string' ? props.CONDICION.trim() : 'Cuerpo de agua';
            return {
              ...f,
              properties: {
                ...props,
                _type: cond,
                _color: '#0284c7',
              },
            };
          });

        const filteredCorrientes = rawCorrientes
          .filter(intersectsGeometry)
          .map((f): TypedMapFeature => {
            const props = (f.properties ?? {}) as LayerFeatureProperties;
            return {
              ...f,
              properties: {
                ...props,
                _type: `Orden ${String(props.ORDER_1 ?? 1)}`,
              },
            };
          });

        if (!isCancelled) {
          setCuencasNearby(filteredCuencas);
          setSubcuencasNearby(filteredSubcuencas);
          setCuerposAguaNearby(filteredCuerposAgua);
          setCorrientesNearby(filteredCorrientes);
        }
      } catch (err) {
        console.error('Error R2 hidrología 1:50k:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void loadHidrologiaData().finally(() => {
      if (!isCancelled) setIsLoading(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [predioGeometry, filterMode]);

  return {
    cuencasNearby: predioGeometry ? cuencasNearby : EMPTY_FEATURES,
    subcuencasNearby: predioGeometry ? subcuencasNearby : EMPTY_FEATURES,
    cuerposAguaNearby: predioGeometry ? cuerposAguaNearby : EMPTY_FEATURES,
    corrientesNearby: predioGeometry ? corrientesNearby : EMPTY_FEATURES,
    isLoadingHidrologia: Boolean(predioGeometry) && isLoading,
  };
};

export interface ClimogramaData {
  mes: string;
  tMax: number;
  tMin: number;
  tMed: number;
  precipitacion: number;
}

export interface ClimogramaResponse {
  estacion: string;
  municipio: string;
  clave: string;
  estado: string;
  periodo?: string;
  distanciaKm?: number | null;
  coordenadas: [number, number];
  datos: ClimogramaData[];
}

export const useClimogramaData = (
  predioCentroid: Feature<Point> | null, 
  estado: string | undefined, 
  municipio: string | undefined, 
  isEnabled: boolean
) => {
  // Ahora tiene tipo estricto en lugar de "any"
  const [climaData, setClimaData] = useState<ClimogramaResponse | null>(null);
  const [isLoadingClima, setIsLoading] = useState<boolean>(false);
  const [errorClima, setErrorClima] = useState<string | null>(null);

  useEffect(() => {
    if (!predioCentroid || !estado || !municipio || !isEnabled) return;
    
    const fetchClima = async () => {
      setIsLoading(true);
      setErrorClima(null);
      try {
        const [lng, lat] = predioCentroid.geometry.coordinates;
        const backendUrl = getGisBackendUrl();
        const params = new URLSearchParams({ estado, municipio, lat: String(lat), lng: String(lng) });
        
        const res = await fetch(`${backendUrl}/conagua/climograma?${params.toString()}`);
        if (!res.ok) {
          const errData = (await res.json()) as { message?: string };
          throw new Error(errData.message || 'Error obteniendo climograma');
        }
        
        const data = (await res.json()) as ClimogramaResponse;
        setClimaData(data);
      } catch (error) {
        setErrorClima(error instanceof Error ? error.message : 'Error al conectar con el servidor');
      } finally {
        setIsLoading(false);
      }
    };
    
    void fetchClima(); 
  }, [predioCentroid, estado, municipio, isEnabled]);

  return { climaData, isLoadingClima, errorClima };
};