import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./state/app";
import Layout from "./components/Layout";
import Bienvenida from "./pages/Bienvenida";
import Bloqueada from "./pages/Bloqueada";
import Panel from "./pages/Panel";
import Facturas from "./pages/Facturas";
import NuevaFactura from "./pages/NuevaFactura";
import VerFactura from "./pages/VerFactura";
import Clientes from "./pages/Clientes";
import Productos from "./pages/Productos";
import Registro from "./pages/Registro";
import Ajustes from "./pages/Ajustes";
import Envios from "./pages/Envios";
import Login from "./pages/Login";
import { Logo } from "./ui/kit";

function Rutas() {
  const { fase, error, toasts } = useApp();
  let contenido;
  if (fase === "cargando") contenido = <div className="h-full flex items-center justify-center text-fg/80"><div className="animate-pulse"><Logo size={56} /></div></div>;
  else if (fase === "error") contenido = <div className="p-8 text-bad">No se pudo abrir la base de datos: {error}</div>;
  else if (fase === "bloqueada") contenido = <Bloqueada />;
  else if (fase === "login") contenido = <Login />;
  else if (fase === "bienvenida") contenido = <Routes><Route path="*" element={<Bienvenida />} /></Routes>;
  else contenido = (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Panel />} />
        <Route path="facturas" element={<Facturas />} />
        <Route path="facturas/nueva" element={<NuevaFactura />} />
        <Route path="facturas/:id" element={<VerFactura />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="productos" element={<Productos />} />
        <Route path="registro" element={<Registro />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="envios" element={<Envios />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>);
  return (
    <>
      {contenido}
      <div className="fixed bottom-24 md:bottom-6 right-4 z-[60] flex flex-col gap-2 items-end" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`glass !rounded-2xl px-4 py-3 text-sm animate-rise max-w-sm ${t.tipo === "error" ? "!border-bad/60 text-bad" : ""}`}>{t.texto}</div>)}
      </div>
    </>
  );
}

export default function App() {
  return <HashRouter><AppProvider><Rutas /></AppProvider></HashRouter>;
}
