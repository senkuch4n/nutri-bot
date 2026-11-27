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
    <PublicPage title="Política de privacidad" updated="27 de noviembre de 2026">
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
        Numa pide a Google dos permisos distintos. Para iniciar sesión, solo tu identidad básica (<code>openid</code>,{" "}
        <code>email</code>, <code>profile</code>). Aparte, y solo si la responsable del consultorio conecta su
        calendario desde Ajustes → Google Calendar, el permiso <strong>calendar.events</strong> sobre Google Calendar
        (junto con su identidad, para mostrar qué cuenta quedó conectada). Iniciar sesión nunca da acceso a tu
        calendario.
      </p>
      <ul>
        <li>
          <strong>A qué datos accedemos:</strong> nombre, correo y foto de tu cuenta de Google, solo para iniciar
          sesión en el panel. Si conectás Google Calendar: el correo y un identificador interno de la cuenta conectada,
          y un token de acceso (refresh token) que nos permite escribir en ese calendario. Numa no lee la lista de tus
          eventos ni tu disponibilidad: solo crea, actualiza y borra los eventos de los turnos que crea el propio Numa.
        </li>
        <li>
          <strong>Para qué los usamos:</strong> el correo del inicio de sesión, para comprobar que tu cuenta tiene
          acceso al consultorio; el correo de la cuenta conectada, para mostrarte en Ajustes qué cuenta está conectada;
          el identificador, para reconocer la misma cuenta si la volvés a conectar; el token, para que cada turno
          confirmado aparezca en tu calendario, se mueva si se reprograma y se borre si se cancela. No usamos datos de
          Google para ningún otro fin, ni para publicidad.
        </li>
        <li>
          <strong>Con quién se comparten:</strong> con nadie. Los datos de Google no se venden ni se transfieren a
          terceros. En particular, ningún dato obtenido de Google se envía a proveedores de inteligencia artificial: el
          asistente del panel y las respuestas con IA del WhatsApp no tienen acceso a la conexión con Google Calendar, y
          los datos de Google no se usan para desarrollar, mejorar ni entrenar modelos.
        </li>
        <li>
          <strong>Cómo se protegen:</strong> el token se guarda cifrado (AES-256-GCM) en la base de datos del servidor
          de Arzium, con una clave propia, separada del inicio de sesión; la base no está expuesta a internet, todas las
          conexiones van cifradas (HTTPS) y el acceso administrativo al servidor está restringido.
        </li>
        <li>
          <strong>Cuánto tiempo se guardan y cómo se borran:</strong> nombre, correo y foto del inicio de sesión viven
          en la cookie de sesión, que vence al cerrar sesión. El token y el correo de la cuenta conectada se guardan
          mientras el calendario esté conectado: al tocar <em>Desconectar</em> en Ajustes → Google Calendar se borran en
          el momento y además pedimos a Google que revoque el permiso. El identificador interno de la cuenta se conserva
          para reconocerla si la volvés a conectar; podés pedir que lo borremos escribiendo a {mail}. También podés
          revocar el permiso desde{" "}
          <a href="https://myaccount.google.com/permissions" rel="noreferrer" target="_blank">
            la configuración de tu cuenta de Google
          </a>
          . Los eventos ya creados quedan en tu calendario y podés borrarlos cuando quieras.
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
          <strong>Google:</strong> inicio de sesión y, si el consultorio conecta su calendario, los eventos de los
          turnos en Google Calendar.
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
          restringido y conexiones cifradas (HTTPS). Los tokens de acceso a Mercado Pago y a
          Google Calendar se guardan cifrados.
        </li>
      </ul>

      <h2>Cuánto tiempo se guardan</h2>
      <p>
        Mientras la persona sea paciente del consultorio y durante el tiempo que la profesional deba conservar la
        historia clínica según la normativa vigente. Las consultas hechas al asistente de inteligencia artificial se
        borran a los 90 días. Del uso del asistente del panel y de las propuestas de plan con inteligencia artificial
        guardamos solo un registro técnico (fecha, función y cantidad de uso), sin el texto de la consulta ni datos de
        pacientes.
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
          Numa requests two separate sets of permissions. Signing in only uses the <code>openid</code>,{" "}
          <code>email</code> and <code>profile</code> scopes. Separately, and only when the clinic owner connects a
          calendar from Settings → Google Calendar, Numa requests{" "}
          <code>https://www.googleapis.com/auth/calendar.events</code> (plus <code>openid</code> and{" "}
          <code>email</code>, to show which account is connected). Signing in never grants access to your calendar.
        </p>
        <ul>
          <li>
            <strong>Data accessed:</strong> your Google name, email address and profile picture (sign-in only). If you
            connect Google Calendar: the email address and an internal identifier of the connected account, and an
            OAuth refresh token that lets Numa write to that calendar. Numa does not read or list your calendar events
            or availability; it only creates, updates and deletes the appointment events that Numa itself created.
          </li>
          <li>
            <strong>Data use:</strong> the sign-in email is checked against the clinic memberships; the connected
            account&apos;s email is shown in Settings; the identifier is used to recognize the same account if you
            reconnect it; the token is used to add each confirmed appointment to your calendar, move it when it is
            rescheduled and delete it when it is cancelled. Google user data is used for nothing else and never for
            advertising.
          </li>
          <li>
            <strong>Data sharing:</strong> Google user data is not shared, sold or transferred to any third party. In
            particular, no data obtained from Google APIs is sent to AI providers: the panel assistant and the WhatsApp
            AI replies have no access to the Google Calendar connection, and Google user data is not used to develop,
            improve or train AI/ML models.
          </li>
          <li>
            <strong>Data protection:</strong> the token is stored encrypted (AES-256-GCM) in Arzium&apos;s server
            database with a dedicated key, separate from sign-in; the database is not exposed to the internet, all
            traffic is encrypted (HTTPS) and administrative access to the server is restricted.
          </li>
          <li>
            <strong>Retention and deletion:</strong> name, email and picture from sign-in live in the session cookie,
            which ends when you sign out. The token and the connected account&apos;s email are kept while the calendar
            is connected; when you click <em>Disconnect</em> in Settings → Google Calendar they are deleted immediately
            and Numa asks Google to revoke the permission. The internal account identifier is kept to recognize the
            account if you reconnect it; email {mail} to have it deleted. You can also revoke access at{" "}
            <a href="https://myaccount.google.com/permissions" rel="noreferrer" target="_blank">
              myaccount.google.com/permissions
            </a>
            . Events already created stay in your calendar and you can delete them at any time.
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
