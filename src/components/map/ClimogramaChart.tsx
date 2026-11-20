import React, { useMemo } from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    ReferenceLine,
} from 'recharts';
import type { ClimogramaData } from '../../hooks/useMapLayers';

interface ClimogramaProps {
    data: ClimogramaData[];
    estacionNombre: string;
    estado: string;
    clave: string;
    coords: [number, number];
    periodo?: string;
}

export const ClimogramaChart: React.FC<ClimogramaProps> = ({
    data,
    estacionNombre,
    estado,
    clave,
    coords,
    periodo = '1981–2010',
}) => {
    // Ajuste dinámico del techo de precipitación en múltiplos de 60 u 80 para que nunca se corte una barra
    const maxPrecipDomain = useMemo(() => {
        const maxVal = Math.max(...data.map((d) => d.precipitacion), 0);
        if (maxVal <= 240) return 240;
        return Math.ceil(maxVal / 60) * 60;
    }, [data]);

    const precipTicks = useMemo(() => {
        const step = maxPrecipDomain / 3;
        return [0, Math.round(step), Math.round(step * 2), maxPrecipDomain];
    }, [maxPrecipDomain]);

    return (
        <div
            className="w-100 h-100 bg-white d-flex flex-column justify-content-between"
            style={{ padding: '26px 24px 22px 24px', boxSizing: 'border-box' }}
        >
            {/* ENCABEZADO DE FICHA CLIMATOLÓGICA */}
            <div
                className="text-center pb-2"
                style={{ borderBottom: '1.5px solid #163f37' }}
            >
                <div
                    className="fw-bold text-uppercase"
                    style={{
                        color: '#163f37',
                        fontSize: '0.96rem',
                        letterSpacing: '0.4px',
                        lineHeight: 1.25,
                    }}
                >
                    CLIMOGRAMA [{periodo}]: ESTACIÓN {estacionNombre}, {estado}
                </div>
                <div
                    className="text-muted mt-1"
                    style={{ fontSize: '0.76rem', fontWeight: 500 }}
                >
                    Coordenadas: ({coords[0].toFixed(6)}°, {coords[1].toFixed(6)}°) &nbsp;|&nbsp; Clave SMN:{' '}
                    <strong className="text-dark">{clave}</strong> &nbsp;|&nbsp; Fuente: CONAGUA / SMN
                </div>
            </div>

            {/* ÁREA DE GRÁFICA CON PROPORCIÓN PANORÁMICA LIMPIA */}
            <div
                className="my-auto"
                style={{
                    width: '100%',
                    height: '470px',
                    backgroundColor: '#fcfdfe',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '14px 8px 6px 8px',
                }}
            >
                <ResponsiveContainer width="100%" height={445}>
                    <ComposedChart data={data} margin={{ top: 14, right: 18, bottom: 10, left: 14 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="0" vertical={false} />

                        {/* Línea superior de cierre del marco del gráfico */}
                        <ReferenceLine yAxisId="temp" y={42} stroke="#cbd5e1" strokeWidth={1} />

                        <XAxis
                            dataKey="mes"
                            tickLine={false}
                            axisLine={{ stroke: '#94a3b8', strokeWidth: 1.2 }}
                            tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                            dy={6}
                        />

                        {/* Eje Y Izquierdo: Temperatura */}
                        <YAxis
                            yAxisId="temp"
                            orientation="left"
                            domain={[12, 42]}
                            ticks={[12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42]}
                            tickFormatter={(v: number) => `${v}°`}
                            axisLine={{ stroke: '#94a3b8', strokeWidth: 1.2 }}
                            tickLine={{ stroke: '#cbd5e1' }}
                            tick={{ fill: '#334155', fontSize: 11.5, fontWeight: 500 }}
                            label={{
                                value: 'Temperatura [°C]',
                                angle: -90,
                                position: 'insideLeft',
                                fill: '#163f37',
                                fontSize: 12.5,
                                fontWeight: 700,
                                dy: 48,
                            }}
                        />

                        {/* Eje Y Derecho: Precipitación */}
                        <YAxis
                            yAxisId="precip"
                            orientation="right"
                            domain={[0, maxPrecipDomain]}
                            ticks={precipTicks}
                            axisLine={{ stroke: '#94a3b8', strokeWidth: 1.2 }}
                            tickLine={{ stroke: '#cbd5e1' }}
                            tick={{ fill: '#0f4c5c', fontSize: 11.5, fontWeight: 600 }}
                            label={{
                                value: 'Precipitación [mm]',
                                angle: 90,
                                position: 'insideRight',
                                fill: '#0f4c5c',
                                fontSize: 12.5,
                                fontWeight: 700,
                                dy: -55,
                            }}
                        />

                        <Tooltip
                            contentStyle={{
                                fontSize: '0.78rem',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            }}
                        />

                        <Bar
                            yAxisId="precip"
                            dataKey="precipitacion"
                            name="Precipitación [mm]"
                            fill="#00c4cc"
                            radius={[2, 2, 0, 0]}
                            barSize={26}
                            isAnimationActive={false}
                        />
                        <Line
                            yAxisId="temp"
                            type="monotone"
                            dataKey="tMax"
                            name="Temp. máxima [°C]"
                            stroke="#8b0000"
                            strokeWidth={3}
                            dot={{ r: 2.5, fill: '#8b0000', strokeWidth: 0 }}
                            isAnimationActive={false}
                        />
                        <Line
                            yAxisId="temp"
                            type="monotone"
                            dataKey="tMed"
                            name="Temp. media [°C]"
                            stroke="#3f8f00"
                            strokeWidth={3}
                            dot={{ r: 2.5, fill: '#3f8f00', strokeWidth: 0 }}
                            isAnimationActive={false}
                        />
                        <Line
                            yAxisId="temp"
                            type="monotone"
                            dataKey="tMin"
                            name="Temp. mínima [°C]"
                            stroke="#005a8b"
                            strokeWidth={3}
                            dot={{ r: 2.5, fill: '#005a8b', strokeWidth: 0 }}
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* LEYENDA INFERIOR ESTILO CARTOGRÁFICO */}
            <div
                className="d-flex justify-content-center align-items-center flex-wrap gap-4 pt-2"
                style={{
                    borderTop: '1px solid #e2e8f0',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    color: '#1e293b',
                }}
            >
                <div className="d-flex align-items-center">
                    <span
                        style={{
                            width: '13px',
                            height: '13px',
                            backgroundColor: '#00c4cc',
                            borderRadius: '50%',
                            display: 'inline-block',
                            marginRight: '8px',
                        }}
                    />
                    Precipitación
                </div>
                <div className="d-flex align-items-center">
                    <span
                        style={{
                            width: '22px',
                            height: '3.5px',
                            backgroundColor: '#3f8f00',
                            borderRadius: '2px',
                            display: 'inline-block',
                            marginRight: '8px',
                        }}
                    />
                    Temperatura media
                </div>
                <div className="d-flex align-items-center">
                    <span
                        style={{
                            width: '22px',
                            height: '3.5px',
                            backgroundColor: '#8b0000',
                            borderRadius: '2px',
                            display: 'inline-block',
                            marginRight: '8px',
                        }}
                    />
                    Temperatura máxima
                </div>
                <div className="d-flex align-items-center">
                    <span
                        style={{
                            width: '22px',
                            height: '3.5px',
                            backgroundColor: '#005a8b',
                            borderRadius: '2px',
                            display: 'inline-block',
                            marginRight: '8px',
                        }}
                    />
                    Temperatura mínima
                </div>
            </div>
        </div>
    );
};