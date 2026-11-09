import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { GeoViewer } from './components/map/GeoViewer';

function App() {
  return (
    // min-vh-100 garantiza que el contenedor ocupe al menos la pantalla completa
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      
      {/* flex-grow-1 hace que este bloque absorba el espacio restante */}
      <main className="flex-grow-1 d-flex align-items-stretch">
        <GeoViewer />
      </main>

      <Footer />
    </div>
  );
}

export default App;