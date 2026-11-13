import React from 'react';
import profepaLogo from '../../assets/img/LOGO_PROFEPA.png';

export const Navbar: React.FC = () => {
    return (
        <nav className="navbar navbar-expand-lg navbar-dark navbar-siivda shadow-sm">
            <div className="container-fluid navbar-wrap px-4">
                <button type="button" className="navbar-brand brand-siivda bg-transparent border-0 p-0 text-start" id="nav-home-link">
                    <img alt="PROFEPA" className="logo-profepa" id="nav-logo" src={profepaLogo} />
                    <span className="titulo-coordinacion">
                        Coordinación de Dictámenes Técnicos en Recursos Naturales
                    </span>
                </button>
                <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#menuPrincipal" aria-controls="menuPrincipal" aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse justify-content-end" id="menuPrincipal">
                    <ul className="navbar-nav menu-siivda">
                        <li className="nav-item">
                            <button type="button" className="nav-link active bg-transparent border-0" id="nav-inicio-link">Inicio</button>
                        </li>
                        <li className="nav-item dropdown">
                            <button type="button" className="nav-link dropdown-toggle bg-transparent border-0" data-bs-toggle="dropdown" aria-expanded="false">Región</button>
                            <ul className="dropdown-menu">
                                <li><button type="button" className="dropdown-item">Pacífico Norte</button></li>
                                <li><button type="button" className="dropdown-item">Norte</button></li>
                                <li><button type="button" className="dropdown-item">Occidente</button></li>
                                <li><button type="button" className="dropdown-item">Bajío</button></li>
                                <li><button type="button" className="dropdown-item">Centro</button></li>
                                <li><button type="button" className="dropdown-item">Golfo de México</button></li>
                                <li><button type="button" className="dropdown-item">Pacífico Sur</button></li>
                                <li><button type="button" className="dropdown-item">Península de Yucatán</button></li>
                            </ul>
                        </li>
                        <li className="nav-item dropdown">
                            <button type="button" className="nav-link dropdown-toggle bg-transparent border-0" data-bs-toggle="dropdown" aria-expanded="false">Módulos</button>
                            <ul className="dropdown-menu">
                                <li><button type="button" className="dropdown-item">Contexto ecológico-territorial</button></li>
                                <li><button type="button" className="dropdown-item">Cuantificación de daños</button></li>
                                <li><button type="button" className="dropdown-item">Valoración económica</button></li>
                                <li><button type="button" className="dropdown-item">Restauración ecológica</button></li>
                                <li><button type="button" className="dropdown-item">Compensación ambiental</button></li>
                            </ul>
                        </li>
                        <li className="nav-item">
                            <button type="button" className="nav-link bg-transparent border-0">Dictámenes</button>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    );
};