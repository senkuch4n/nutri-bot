/** Lista de pacientes + el slot `@modal`: tocar un paciente navega a `/pacientes/<id>` y la ficha se
 *  abre en un modal encima de la lista (ruta interceptada). Recargar esa URL, o llegar desde otra
 *  pantalla, muestra la página completa (`pacientes/[id]`). */
export default function PatientDirectoryLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
