export const ECO_LAYERS_CONFIG = [
    { id: 'aicas', file: 'aicas.fgb', title: 'Área de Importancia para la Conservación de las Aves (AICA)', color: '#d63384' },
    { id: 'ramsar', file: 'ramsar.fgb', title: 'Sitio Ramsar', color: '#0d6efd' },
    { id: 'anp_federal', file: 'anp_federal.fgb', title: 'Área Natural Protegida federal', color: '#198754' },
    { id: 'anp_estatal', file: 'anp_estatal.fgb', title: 'Área Natural Protegida estatal o municipal', color: '#fd7e14' },
    { id: 'advc', file: 'advc.fgb', title: 'Área Destinada Voluntariamente a la Conservación (ADVC)', color: '#65a30d' },
    { id: 'rtp', file: 'rtp.fgb', title: 'Región Terrestre Prioritaria', color: '#ffc107' },
    { id: 'rhp', file: 'rhp.fgb', title: 'Región Hídrica Prioritaria', color: '#0dcaf0' },
];

export const vegSeriesOptions = [
    { id: 'serie_1', label: 'Serie I' },
    { id: 'serie_2', label: 'Serie II' },
    { id: 'serie_3', label: 'Serie III' },
    { id: 'serie_4', label: 'Serie IV' },
    { id: 'serie_5', label: 'Serie V' },
    { id: 'serie_6', label: 'Serie VI' },
    { id: 'serie_7', label: 'Serie VII' },
];

export const toDMS = (deg: number, isLat: boolean) => {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.floor((minutesFloat - minutes) * 60);
    const direction = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${degrees}°${minutes}'${seconds}"${direction}`;
};

export const getColorForVegetation = (str: string) => {
    const colors = [
        '#a3e635', '#4ade80', '#fbbf24', '#f87171', '#60a5fa', '#c084fc',
        '#f472b6', '#fb923c', '#38bdf8', '#34d399', '#a78bfa', '#fbb6ce',
        '#86efac', '#fde047', '#14b8a6', '#f43f5e', '#8b5cf6', '#d946ef'
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.codePointAt(i) || 0 + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};