// src/utils/fgbReader.ts
import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import type { Feature } from 'geojson';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Consulta un archivo FlatGeobuf en Cloudflare R2 descargando
 * únicamente los bytes que intersectan con el BBOX.
 */
export async function queryFgbLayer(
  fileName: string,
  bbox: BoundingBox
): Promise<Feature[]> {
  const baseUrl = import.meta.env.VITE_R2_PUBLIC_URL || '';
  const url = `${baseUrl}/${fileName}`;
  const features: Feature[] = [];

  try {
    const iterator = deserialize(url, bbox);
    for await (const feature of iterator) {
      features.push(feature as Feature);
    }
  } catch (error) {
    console.warn(`Error al consultar ${fileName} desde R2:`, error);
  }

  return features;
}