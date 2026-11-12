import { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { queryFgbLayer } from '../utils/fgbReader';
import { ECO_LAYERS_CONFIG, getColorForVegetation } from '../config/mapConfig';

export const useSentinelData = (predioCentroid: any, targetDate: string | undefined) => {
  const [sentinelUrl, setSentinelUrl] = useState<string | null>(null);
  const [sentinelMetadata, setSentinelMetadata] = useState<any>(null);
  const [useSentinel, setUseSentinel] = useState<boolean>(true);

  useEffect(() => {
    if (!predioCentroid || !targetDate) return;
    const fetchSentinelData = async () => {
      try {
        const [lng, lat] = predioCentroid.geometry.coordinates;
        const backendUrl = import.meta.env.VITE_SENTINEL_API_URL || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/sentinel/tiles?lat=${lat}&lng=${lng}&date=${targetDate}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.tileUrl) {
            setSentinelUrl(result.tileUrl);
            setSentinelMetadata(result.metadata);
            setUseSentinel(true);
            return;
          }
        }
        setSentinelUrl(null); setSentinelMetadata(null); setUseSentinel(false);
      } catch (error) {
        setSentinelUrl(null); setSentinelMetadata(null); setUseSentinel(false);
      }
    };
    fetchSentinelData();
  }, [predioCentroid, targetDate]);

  return { sentinelUrl, sentinelMetadata, useSentinel, setUseSentinel };
};

// Quitamos currentPlano de los parámetros
export const useEcoLayers = (buffer10km: any) => {
  const [ecoNearby, setEcoNearby] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Ya no bloqueamos la consulta por plano. Si hay buffer, buscamos.
    if (!buffer10km) return;
    let isCancelled = false;
    
    const loadEcoData = async () => {
      setIsLoading(true);
      const [minX, minY, maxX, maxY] = turf.bbox(buffer10km);
      try {
        const results = await Promise.all(
          ECO_LAYERS_CONFIG.map(async (layer) => {
            const raw = await queryFgbLayer(layer.file, { minX, minY, maxX, maxY });
            return raw.filter((f) => {
              try { return turf.booleanIntersects(f as any, buffer10km as any); } catch { return false; }
            }).map((f) => ({
              ...f, properties: { ...f.properties, _color: layer.color, _title: layer.title, _layerId: layer.id }
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
    loadEcoData();
    return () => { isCancelled = true; };
  }, [buffer10km]);

  return { ecoNearby, isLoadingEco: isLoading };
};

// Quitamos currentPlano de los parámetros
export const useVegetationLayers = (buffer10km: any, selectedVegSerie: string) => {
  const [vegNearby, setVegNearby] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Ya no bloqueamos la consulta por plano.
    if (!buffer10km) return;
    let isCancelled = false;
    
    const loadVegData = async () => {
      setIsLoading(true);
      const [minX, minY, maxX, maxY] = turf.bbox(buffer10km);
      try {
        const raw = await queryFgbLayer(`usv_${selectedVegSerie}.fgb`, { minX, minY, maxX, maxY });
        const filtered = raw.filter((f) => {
          try { return turf.booleanIntersects(f as any, buffer10km as any); } catch { return false; }
        }).map((f) => {
          const props = f.properties || {};
          const typeVeg = props.DESCRIPCIO || props.descripcio || props.TIPO_VEG || 'Vegetación Indeterminada';
          return { ...f, properties: { ...props, _type: typeVeg, _color: getColorForVegetation(typeVeg) } };
        });
        if (!isCancelled) setVegNearby(filtered);
      } catch (err) {
        console.error('Error R2 vegetación:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    loadVegData();
    return () => { isCancelled = true; };
  }, [buffer10km, selectedVegSerie]);

  return { vegNearby, isLoadingVeg: isLoading };
};