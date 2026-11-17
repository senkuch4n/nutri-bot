import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Qué es Numa",
  description: "Numa: turnos por WhatsApp y seguimiento clínico para consultorios de nutrición.",
};

/** Página de inicio pública (la que figura en Google OAuth como "página principal de la app"). */
export default function AcercaPage() {
  return (
    <PublicPage title="Numa: turnos y seguimiento para consultorios de nutrición">
      <p>
        Numa es un sistema de Arzium para profesionales de la nutrición. Ordena la agenda del consultorio y el
        seguimiento de cada paciente en un solo lugar.
      </p>
      <h2>Qué hace</h2>
      <ul>
        <li>
          <strong>Turnos por WhatsApp:</strong> los pacientes sacan, confirman o cancelan su turno escribiéndole al
          número del consultorio, con recordatorios automáticos.
        </li>
        <li>
          <strong>Señas con Mercado Pago:</strong> cuando un servicio lo pide, el paciente paga la seña desde un link y
          el turno se confirma solo.
        </li>
        <li>
          <strong>Ficha clínica:</strong> antropometría, evolución, planes alimentarios y registro de comidas de cada
          paciente.
        </li>
        <li>
          <strong>Portal del paciente:</strong> cada paciente ve sus turnos y su plan desde un link personal.
        </li>
        <li>
          <strong>Google Calendar:</strong> los turnos se copian como eventos en el calendario de la profesional, para
          verlos junto al resto de su agenda.
        </li>
      </ul>
      <h2>Quién puede entrar</h2>
      <p>
        El panel lo usa solo la profesional y las personas que ella autoriza, con su cuenta de Google. Numa usa el
        acceso a Google Calendar únicamente para crear, actualizar y borrar los eventos de los turnos. Más detalle en
        la <Link href="/privacidad">política de privacidad</Link>.
      </p>
      <p>
        <Link href="/inicio">Ingresar al panel</Link>
      </p>
    </PublicPage>
  );
}
