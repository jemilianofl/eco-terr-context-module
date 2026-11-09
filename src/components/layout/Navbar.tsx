import React from 'react';
import profepaLogo from '../../assets/img/LOGO_PROFEPA.png';

export const Navbar: React.FC = () => {
    return (
        <nav className="navbar navbar-expand-lg navbar-dark navbar-siivda shadow-sm">
            <div className="container-fluid navbar-wrap px-4">
                <a className="navbar-brand brand-siivda" href="#" id="nav-home-link">
                    <img alt="PROFEPA" className="logo-profepa" id="nav-logo" src={profepaLogo} />
                    <span className="titulo-coordinacion">
                        Coordinación de Dictámenes Técnicos en Recursos Naturales
                    </span>
                </a>
                <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#menuPrincipal" aria-controls="menuPrincipal" aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse justify-content-end" id="menuPrincipal">
                    <ul className="navbar-nav menu-siivda">
                        <li className="nav-item">
                            <a className="nav-link active" href="#" id="nav-inicio-link">Inicio</a>
                        </li>
                        <li className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" role="button" data-bs-toggle="dropdown">Región</a>
                            <ul className="dropdown-menu">
                                <li><a className="dropdown-item" href="#">Pacífico Norte</a></li>
                                <li><a className="dropdown-item" href="#">Norte</a></li>
                                <li><a className="dropdown-item" href="#">Occidente</a></li>
                                <li><a className="dropdown-item" href="#">Bajío</a></li>
                                <li><a className="dropdown-item" href="#">Centro</a></li>
                                <li><a className="dropdown-item" href="#">Golfo de México</a></li>
                                <li><a className="dropdown-item" href="#">Pacífico Sur</a></li>
                                <li><a className="dropdown-item" href="#">Península de Yucatán</a></li>
                            </ul>
                        </li>
                        <li className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">Módulos</a>
                            <ul className="dropdown-menu">
                                <li><a className="dropdown-item" href="#">Contexto ecológico-territorial</a></li>
                                <li><a className="dropdown-item" href="#">Cuantificación de daños</a></li>
                                <li><a className="dropdown-item" href="#">Valoración económica</a></li>
                                <li><a className="dropdown-item" href="#">Restauración ecológica</a></li>
                                <li><a className="dropdown-item" href="#">Compensación ambiental</a></li>
                            </ul>
                        </li>
                        <li className="nav-item">
                            <a className="nav-link" href="#">Dictámenes</a>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    );
};