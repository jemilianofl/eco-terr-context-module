/** Tipos mínimos de "georaster" (el paquete no trae los suyos). */
declare module 'georaster' {
  export interface GeoRasterValuesWindow {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    resampleMethod?: 'nearest' | 'bilinear';
  }

  export interface GeoRaster {
    projection: number;
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
    pixelWidth: number;
    pixelHeight: number;
    width: number;
    height: number;
    numberOfRasters: number;
    noDataValue: number | null;
    /** Solo en rasters remotos (COG): valores [banda][fila][columna] de una ventana. */
    getValues: (window: GeoRasterValuesWindow) => Promise<number[][][]>;
  }

  export default function parseGeoraster(source: string | ArrayBuffer): Promise<GeoRaster>;
}
