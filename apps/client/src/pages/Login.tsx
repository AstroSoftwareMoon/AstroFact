import { useApp } from "../state/app";
import { Logo } from "../ui/kit";
import AccesoServidor from "../components/AccesoServidor";

export default function Login() {
  const app = useApp();
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="glass p-8 w-full max-w-sm animate-rise">
        <div className="flex justify-center text-fg mb-3"><Logo size={44} /></div>
        <h1 className="text-xl font-semibold text-center mb-5">Entrar en AstroFact</h1>
        <AccesoServidor />
        <button className="text-xs text-muted mt-6 underline w-full" onClick={() => void app.usarLocal()}>Usar AstroFact solo en este dispositivo</button>
      </div>
    </div>
  );
}
