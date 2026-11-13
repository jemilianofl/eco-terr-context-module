import React from 'react';
import profepaLogo from '../../assets/img/LOGO_PROFEPA.png';

export const Footer: React.FC = () => {
    return (
        <footer className="footer-siivda py-5">
            <div className="container-fluid px-4 px-lg-5">
                <div className="row align-items-center">
                    <div className="col-lg-4 text-center text-lg-start mb-4 mb-lg-0 border-end-lg">
                        <img alt="PROFEPA" className="logo-profepa" id="nav-logo" src={profepaLogo} />
                        <p className="footer-org-name mb-0">Subprocuraduría de Recursos Naturales</p>
                        <p className="footer-sub-name">Coordinación de dictámenes técnicos en Recursos Naturales</p>
                    </div>
                    <div className="col-lg-4 text-center mb-4 mb-lg-0">
                        <div className="footer-contact-info">
                            <span className="d-block text-gold fw-bold mb-2">Soporte Técnico SIIVDA</span>
                            <p className="mb-1"><i className="bi bi-person-badge me-2"></i><strong>Coordinación de Dictámenes Técnicos en Recursos Naturales</strong></p>
                            <p className="mb-0"><i className="bi bi-envelope-fill me-2"></i><a href="mailto:zaira.perez@profepa.gob.mx" className="text-white text-decoration-none">zaira.perez@profepa.gob.mx</a></p>
                            <p className="mb-0"><i className="bi bi-envelope-fill me-2"></i><a href="mailto:monica.toledo@profepa.gob.mx" className="text-white text-decoration-none">monica.toledo@profepa.gob.mx</a></p>
                            <p className="mb-0"><i className="bi bi-envelope-fill me-2"></i><a href="mailto:jose.valdez@profepa.gob.mx" className="text-white text-decoration-none">jose.valdez@profepa.gob.mx</a></p>
                            <p className="mb-0"><i className="bi bi-envelope-fill me-2"></i><a href="mailto:alma.arrazola@profepa.gob.mx" className="text-white text-decoration-none">alma.arrazola@profepa.gob.mx</a></p>
                            <p className="mb-0"><i className="bi bi-envelope-fill me-2"></i><a href="mailto:mariana.gonzalez@profepa.gob.mx" className="text-white text-decoration-none">mariana.gonzalez@profepa.gob.mx</a></p>
                        </div>
                    </div>
                    <div className="col-lg-4 text-center text-lg-end">
                        <div className="footer-legal">
                            <p className="mb-1">PROFEPA © 2026</p>
                            <p className="small text-muted mb-0">Ciudad de México, México</p>
                            <div className="mt-2">
                                <button type="button" className="btn btn-link p-0 border-0 text-muted small text-decoration-none me-3">Aviso de Privacidad</button>
                                <button type="button" className="btn btn-link p-0 border-0 text-muted small text-decoration-none">Términos y Condiciones</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};