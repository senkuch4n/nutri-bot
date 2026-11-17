import type { Metadata } from "next";
import { ARZIUM_CONTACT_EMAIL, PublicPage } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Política de privacidad — Numa",
  description: "Qué datos trata Numa, para qué, con quién se comparten y cómo ejercer tus derechos.",
};

/** Política de privacidad pública. Requisito de Google OAuth (verificación de la app) y de la Ley 25.326.
 *  Si cambia lo que hace el sistema con los datos (nuevos proveedores, nuevos permisos de Google),
 *  actualizar este texto y la fecha. */
export default function PrivacidadPage() {
  const mail = <a href={`mailto:${ARZIUM_CONTACT_EMAIL}`}>{ARZIUM_CONTACT_EMAIL}</a>;
  return (
    <PublicPage title="Política de privacidad" updated="17 de noviembre de 2026">
      <p>
        Esta política explica qué datos personales trata Numa, el sistema de turnos y seguimiento clínico para
        consultorios de nutrición, para qué los usa y cómo podés ejercer tus derechos. El responsable del sistema y de
        los datos es <strong>Arzium</strong>. Contacto: {mail}.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>De los pacientes:</strong> nombre, número de WhatsApp, los mensajes que le envían al consultorio, los
          turnos y pagos de señas, y la información clínica que carga la profesional (antropometría, evolución, planes
          alimentarios y registro de comidas). Los datos de salud son datos sensibles y se tratan con confidencialidad
          y bajo secreto profesional.
        </li>
        <li>
          <strong>De quienes usan el panel:</strong> nombre, correo y foto de la cuenta de Google con la que inician
          sesión.
        </li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Dar, confirmar, recordar, reprogramar y cancelar turnos.</li>
        <li>Llevar la ficha clínica y el seguimiento nutricional de cada paciente.</li>
        <li>Cobrar señas por Mercado Pago cuando el servicio lo requiere.</li>
        <li>Responder consultas de los pacientes por WhatsApp.</li>
      </ul>
      <p>No vendemos datos ni los usamos para publicidad.</p>

      <h2>Datos de Google</h2>
      <p>
        Numa pide a Google estos permisos: tu identidad básica (nombre, correo y foto) para iniciar sesión, y el
        permiso <strong>calendar.events</strong> sobre Google Calendar. Con ese permiso Numa solo crea, actualiza y
        borra los eventos de los turnos del consultorio en el calendario de la profesional. No lee ni modifica otros
        eventos, no comparte esos datos con terceros y no los usa para entrenar modelos de inteligencia artificial.
      </p>
      <p>
        El uso y la transferencia de la información recibida de las API de Google se ajustan a la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">
          Política de datos de usuario de los servicios de las API de Google
        </a>
        , incluidos los requisitos de uso limitado (Limited Use). Podés revocar el acceso cuando quieras desde{" "}
        <a href="https://myaccount.google.com/permissions" rel="noreferrer" target="_blank">
          la configuración de tu cuenta de Google
        </a>
        .
      </p>

      <h2>Con quién se comparten</h2>
      <p>Solo con los proveedores que hacen falta para que el sistema funcione, y solo lo necesario:</p>
      <ul>
        <li>
          <strong>WhatsApp (Meta):</strong> los mensajes entre el consultorio y los pacientes.
        </li>
        <li>
          <strong>Google:</strong> inicio de sesión y eventos de los turnos en Google Calendar.
        </li>
        <li>
          <strong>Mercado Pago:</strong> el monto y el detalle de la seña. Numa no ve ni guarda datos de tarjetas.
        </li>
        <li>
          <strong>Proveedores de inteligencia artificial</strong> (DeepSeek o Anthropic), solo cuando se usan las
          funciones de inteligencia artificial: el texto de las consultas que los pacientes hacen al asistente del
          WhatsApp (sin su nombre); los datos del plan cuando la profesional pide una propuesta de plan alimentario; y,
          cuando la profesional usa el asistente del panel, los datos de los pacientes sobre los que pregunta (por
          ejemplo nombre, turnos y resumen de la ficha). Estos proveedores procesan los datos para responder y no los
          usamos para entrenar modelos.
        </li>
        <li>
          <strong>Servidor:</strong> los datos se guardan en un servidor privado contratado por Arzium, con acceso
          restringido y conexiones cifradas (HTTPS). Los tokens de acceso a Mercado Pago se guardan cifrados.
        </li>
      </ul>

      <h2>Cuánto tiempo se guardan</h2>
      <p>
        Mientras la persona sea paciente del consultorio y durante el tiempo que la profesional deba conservar la
        historia clínica según la normativa vigente. Las consultas hechas al asistente de inteligencia artificial se
        borran a los 90 días.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación, actualización o supresión de tus datos escribiendo a {mail}. Respondemos
        dentro de los plazos de la Ley 25.326 (10 días corridos para el acceso y 5 días hábiles para la rectificación
        o supresión).
      </p>
      <p className="text-footnote text-muted-foreground">
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma
        gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme
        lo establecido en el artículo 14, inciso 3 de la Ley N.º 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA,
        en su carácter de Órgano de Control de la Ley N.º 25.326, tiene la atribución de atender las denuncias y
        reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes
        en materia de protección de datos personales.
      </p>

      <h2>Cambios</h2>
      <p>Si cambia esta política, publicamos la versión nueva en esta página con su fecha.</p>
    </PublicPage>
  );
}
