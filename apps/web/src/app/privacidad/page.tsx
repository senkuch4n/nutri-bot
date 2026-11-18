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
    <PublicPage title="Política de privacidad" updated="18 de noviembre de 2026">
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
        Numa pide a Google estos permisos: tu identidad básica (<code>openid</code>, <code>email</code>,{" "}
        <code>profile</code>) para iniciar sesión, y <strong>calendar.events</strong> sobre Google Calendar.
      </p>
      <ul>
        <li>
          <strong>A qué datos accedemos:</strong> nombre, correo y foto de tu cuenta de Google, solo para iniciar
          sesión en el panel. Si sos la profesional dueña del calendario, también un token de acceso (refresh token)
          que nos permite escribir en tu Google Calendar. Numa no lee la lista de tus eventos: solo crea, actualiza y
          borra los eventos de los turnos que crea el propio Numa.
        </li>
        <li>
          <strong>Para qué los usamos:</strong> el correo, para comprobar que tu cuenta tiene permiso para entrar al
          panel; el token, para que cada turno confirmado aparezca en tu calendario, se mueva si se reprograma y se
          borre si se cancela. No usamos datos de Google para ningún otro fin, ni para publicidad.
        </li>
        <li>
          <strong>Con quién se comparten:</strong> con nadie. Los datos de Google no se venden ni se transfieren a
          terceros, tampoco a los proveedores de inteligencia artificial, y no se usan para entrenar modelos.
        </li>
        <li>
          <strong>Cómo se protegen:</strong> el token se guarda en la base de datos del servidor de Arzium, que no está
          expuesta a internet; solo lo usan los procesos de Numa en ese servidor, todas las conexiones van cifradas
          (HTTPS) y el acceso administrativo al servidor está restringido.
        </li>
        <li>
          <strong>Cuánto tiempo se guardan y cómo se borran:</strong> nombre, correo y foto viven en la cookie de
          sesión, que vence al cerrar sesión; la base solo guarda el correo durante unos minutos (como máximo 10)
          mientras conectás Mercado Pago, para comprobar que la conexión la terminó la misma sesión. El token se guarda mientras el calendario esté
          conectado y se borra en el momento en que tocás <em>Desconectar</em> en Ajustes → Google Calendar. También
          podés revocarlo desde{" "}
          <a href="https://myaccount.google.com/permissions" rel="noreferrer" target="_blank">
            la configuración de tu cuenta de Google
          </a>
          . Los eventos ya creados quedan en tu calendario y podés borrarlos cuando quieras. Para pedir la supresión
          de cualquier dato, escribinos a {mail}.
        </li>
      </ul>
      <p>
        El uso y la transferencia de la información recibida de las API de Google se ajustan a la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">
          Política de datos de usuario de los servicios de las API de Google
        </a>
        , incluidos los requisitos de uso limitado (Limited Use).
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

      <h2 lang="en">Google user data (English summary)</h2>
      <div lang="en">
        <p>
          Numa requests the <code>openid</code>, <code>email</code> and <code>profile</code> scopes to sign in, and{" "}
          <code>https://www.googleapis.com/auth/calendar.events</code> for Google Calendar.
        </p>
        <ul>
          <li>
            <strong>Data accessed:</strong> your Google name, email address and profile picture (sign-in only) and, for
            the professional who owns the calendar, an OAuth refresh token. Numa does not read or list your calendar
            events; it only creates, updates and deletes the appointment events that Numa itself created.
          </li>
          <li>
            <strong>Data use:</strong> the email address is checked against the list of accounts allowed into the
            panel; the token is used to add each confirmed appointment to your calendar, move it when it is
            rescheduled and delete it when it is cancelled. Google user data is used for nothing else and never for
            advertising.
          </li>
          <li>
            <strong>Data sharing:</strong> Google user data is not shared, sold or transferred to any third party,
            including AI providers, and is not used to develop, improve or train AI/ML models.
          </li>
          <li>
            <strong>Data protection:</strong> the token is stored in Arzium&apos;s server database, which is not
            exposed to the internet and is only used by Numa&apos;s own processes; all traffic is encrypted (HTTPS)
            and administrative access to the server is restricted.
          </li>
          <li>
            <strong>Retention and deletion:</strong> name, email and picture live in the session cookie, which ends
            when you sign out; the database only keeps the email for a few minutes (at most 10) while you connect
            Mercado Pago, to check that the same session completes that connection. The token is kept while the calendar is
            connected and is deleted immediately when you click <em>Disconnect</em> in Settings → Google Calendar. You
            can also revoke access at{" "}
            <a href="https://myaccount.google.com/permissions" rel="noreferrer" target="_blank">
              myaccount.google.com/permissions
            </a>
            . To request deletion of any data, email {mail}.
          </li>
        </ul>
        <p>
          Numa&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </div>

      <h2>Cambios</h2>
      <p>Si cambia esta política, publicamos la versión nueva en esta página con su fecha.</p>
    </PublicPage>
  );
}
