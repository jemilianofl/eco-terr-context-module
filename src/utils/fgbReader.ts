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
  const rawBaseUrl: unknown = import.meta.env.VITE_R2_PUBLIC_URL;
  const baseUrl = (typeof rawBaseUrl === 'string' ? rawBaseUrl : '').replace(/\/$/, '');
  const url = `${baseUrl}/${fileName}`;
  const features: Feature[] = [];

  try {
    const options = { rect: bbox };
    const iterator = deserialize(url, options);

    for await (const feature of iterator) {
      features.push(feature);
    }
  } catch (error) {
    console.warn(`Error al consultar ${fileName} desde R2:`, error);
  }

  return features;
}