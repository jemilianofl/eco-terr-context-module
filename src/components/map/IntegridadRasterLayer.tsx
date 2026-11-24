import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { Layer } from 'leaflet';
import GeoRasterLayer from 'georaster-layer-for-leaflet';
import type { GeoRaster } from 'georaster';
import { integridadColor } from '../../config/mapConfig';

interface IntegridadRasterLayerProps {
  georaster: GeoRaster;
  opacity: number;
  /** Encima de la imagen satelital y las etiquetas base (TileLayer usa zIndex 1). */
  zIndex?: number;
}

/** Dibuja el Índice de Integridad Ecosistémica (COG 0–1) con la paleta rojo → verde. */
export const IntegridadRasterLayer = ({ georaster, opacity, zIndex = 5 }: IntegridadRasterLayerProps) => {
  const map = useMap();

  useEffect(() => {
    const noData = georaster.noDataValue;
    const options = {
      georaster,
      opacity,
      zIndex,
      resolution: 128,
      pixelValuesToColorFn: (values: number[]) => {
        const v = values[0];
        if (v === undefined || !Number.isFinite(v) || v === noData || v < -1 || v > 2) return null;
        return integridadColor(v);
      },
    };
    // Los tipos de la librería no exponen su constructor de forma deducible y su GeoRaster
    // no coincide con nuestra declaración mínima: las opciones se validan arriba.
    const layer = new GeoRasterLayer(options as never) as Layer;
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, georaster, opacity, zIndex]);

  return null;
};