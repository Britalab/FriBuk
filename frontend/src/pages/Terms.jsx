import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Terms() {
  return (
    <div className="legal-page">
      <div className="legal-container">

        <Link to="/" className="legal-back">
          ← Volver a FriBuk
        </Link>

        <header className="legal-header">
          <span className="legal-label">FRIBUK</span>
          <h1>Términos y Condiciones</h1>
          <p className="legal-date">
            Última actualización: septiembre de 2026
          </p>
        </header>

        <div className="legal-intro">
          <p>
            Bienvenido/a a <strong>FriBuk</strong>, una plataforma destinada a
            la publicación, lectura y descubrimiento de historias y obras
            escritas por sus usuarios.
          </p>

          <p>
            Al crear una cuenta o utilizar FriBuk, aceptas estos Términos y
            Condiciones. Si no estás de acuerdo con alguno de ellos, debes
            abstenerte de utilizar la plataforma.
          </p>
        </div>

        <section className="legal-section">
          <h2>1. Sobre FriBuk</h2>

          <p>
            FriBuk es una plataforma digital que permite a sus usuarios crear
            perfiles, publicar historias y capítulos, leer obras de otros
            usuarios e interactuar mediante comentarios, recomendaciones,
            calificaciones y seguimiento de perfiles.
          </p>

          <p>
            FriBuk proporciona las herramientas necesarias para publicar y
            visualizar contenido, pero las obras publicadas son creadas y
            proporcionadas por sus respectivos usuarios.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Creación de una cuenta</h2>

          <p>
            Para utilizar determinadas funciones de FriBuk es necesario crear
            una cuenta.
          </p>

          <p>El usuario se compromete a:</p>

          <ul>
            <li>
              Proporcionar información verdadera y actualizada cuando sea
              requerida.
            </li>
            <li>
              Mantener la seguridad de sus credenciales de acceso.
            </li>
            <li>No compartir deliberadamente su cuenta con terceros.</li>
            <li>No utilizar la identidad de otra persona.</li>
            <li>
              No crear cuentas destinadas a suplantar a otros usuarios.
            </li>
            <li>
              Informar cuando sospeche que su cuenta ha sido utilizada sin
              autorización.
            </li>
          </ul>

          <p>
            Cada usuario es responsable de las actividades realizadas desde su
            cuenta, salvo cuando exista evidencia de un acceso no autorizado.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Perfiles de usuario</h2>

          <p>
            Los usuarios pueden crear un perfil dentro de FriBuk.
          </p>

          <p>
            Dependiendo de las funciones disponibles, el perfil puede mostrar
            información como:
          </p>

          <ul>
            <li>Nombre de usuario.</li>
            <li>
              Nombre o descripción proporcionada voluntariamente por el
              usuario.
            </li>
            <li>Imagen de perfil.</li>
            <li>Historias publicadas.</li>
            <li>Información relacionada con seguidores y seguidos.</li>
            <li>Actividad pública realizada dentro de la plataforma.</li>
          </ul>

          <p>
            El usuario debe evitar publicar información personal propia o de
            terceros que no desee hacer pública.
          </p>

          <p>
            FriBuk podrá retirar información que exponga datos personales de
            terceros sin autorización.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Publicación de historias y capítulos</h2>

          <p>
            Los usuarios pueden publicar historias y capítulos de su propia
            creación o contenido sobre el cual posean los derechos o permisos
            necesarios.
          </p>

          <p>El usuario es responsable del contenido que publica.</p>

          <p>Al publicar una obra, el usuario declara que:</p>

          <ul>
            <li>
              Tiene los derechos necesarios para publicar el contenido.
            </li>
            <li>
              No está presentando deliberadamente como propio el trabajo de
              otra persona.
            </li>
            <li>
              No utilizará FriBuk para distribuir contenido cuya publicación
              infrinja derechos de terceros.
            </li>
            <li>
              La información proporcionada sobre la obra no busca engañar
              deliberadamente a otros usuarios.
            </li>
          </ul>

          <p>
            FriBuk podrá recibir denuncias relacionadas con contenido publicado
            y aplicar su procedimiento de revisión correspondiente.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Derechos sobre las obras</h2>

          <p>
            El usuario conserva los derechos que le correspondan sobre las
            historias, capítulos, ilustraciones, portadas y demás contenido
            original que publique en FriBuk.
          </p>

          <div className="legal-highlight">
            <strong>
              La publicación de una obra en FriBuk no transfiere la propiedad
              de dicha obra a FriBuk.
            </strong>
          </div>

          <p>
            Para poder prestar el servicio, el usuario concede a FriBuk una
            autorización limitada para almacenar, reproducir técnicamente,
            procesar y mostrar el contenido dentro de la plataforma y sus
            funcionalidades.
          </p>

          <p>
            Esta autorización existe únicamente en la medida necesaria para
            operar FriBuk y no implica que FriBuk se convierta en propietario
            de la obra.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Contenido permitido</h2>

          <p>
            FriBuk permite una amplia variedad de géneros y temáticas
            literarias.
          </p>

          <p>Las obras pueden incluir, dependiendo de su clasificación y contexto:</p>

          <ul>
            <li>Romance.</li>
            <li>Fantasía.</li>
            <li>Ciencia ficción.</li>
            <li>Misterio.</li>
            <li>Terror.</li>
            <li>Drama.</li>
            <li>Acción.</li>
            <li>Temáticas adultas.</li>
            <li>Lenguaje fuerte.</li>
            <li>Violencia ficticia.</li>
            <li>Relaciones sentimentales o sexuales entre personajes adultos.</li>
          </ul>

          <p>
            Los usuarios deberán clasificar y describir adecuadamente sus obras
            cuando corresponda, especialmente cuando estas puedan no ser
            apropiadas para determinados públicos.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Contenido prohibido</h2>

          <p>
            Independientemente del género o temática de una obra, no está
            permitido utilizar FriBuk para publicar contenido que:
          </p>

          <ul>
            <li>Involucre sexualmente a menores de edad.</li>
            <li>Sexualice o explote a menores.</li>
            <li>Contenga material de abuso sexual infantil.</li>
            <li>Contenga representaciones gráficas de tortura o crueldad grave hacia animales, o promueva deliberadamente el maltrato animal.</li>
            <li>Promueva o facilite actividades delictivas.</li>
            <li>
              Contenga amenazas reales dirigidas contra una persona.
            </li>
            <li>
              Exponga deliberadamente información privada o sensible de
              terceros.
            </li>
            <li>
              Se utilice para acosar, perseguir o intimidar a otros usuarios.
            </li>
            <li>
              Suplante deliberadamente a otra persona con intención de engañar
              o perjudicar.
            </li>
            <li>
              Infrinja de manera deliberada los derechos de autor u otros
              derechos de propiedad intelectual de terceros.
            </li>
            <li>
              Contenga malware u otro contenido destinado a perjudicar los
              sistemas de FriBuk o de sus usuarios.
            </li>
            <li>
              Utilice la plataforma de manera fraudulenta o maliciosa.
            </li>
          </ul>

          <p>
            FriBuk podrá retirar contenido que corresponda a estas categorías
            y aplicar las medidas establecidas en su Política de Moderación.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Contenido adulto</h2>

          <p>
            FriBuk puede permitir obras destinadas a un público adulto cuando
            su contenido sea legal y cumpla las reglas de la plataforma.
          </p>

          <div className="legal-highlight">
            <strong>
              La existencia de contenido adulto permitido no implica la
              eliminación automática de la cuenta del usuario.
            </strong>
          </div>

          <p>
            Las obras que contengan material adulto deberán utilizar las
            clasificaciones o advertencias correspondientes cuando estas
            funcionalidades estén disponibles.
          </p>

          <p>
            El contenido adulto no podrá involucrar menores de edad ni utilizar
            la plataforma para cometer, promover o facilitar conductas
            ilegales.
          </p>

          <p>
            FriBuk podrá establecer mecanismos adicionales de clasificación,
            advertencia, visibilidad o restricción de acceso para determinadas
            obras.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Comentarios e interacciones</h2>

          <p>
            FriBuk permite que los usuarios interactúen mediante comentarios,
            recomendaciones, calificaciones y otras herramientas disponibles
            en la plataforma.
          </p>

          <p>
            Estas funciones deben utilizarse de manera responsable.
          </p>

          <p>No está permitido utilizar las herramientas de interacción para:</p>

          <ul>
            <li>Acosar a otros usuarios.</li>
            <li>Amenazar.</li>
            <li>Publicar información privada.</li>
            <li>Realizar spam.</li>
            <li>Manipular deliberadamente las funciones de valoración.</li>
            <li>
              Crear cuentas destinadas a manipular artificialmente
              recomendaciones o calificaciones.
            </li>
            <li>Publicar contenido ilegal.</li>
          </ul>

          <p>
            Las opiniones expresadas mediante comentarios o calificaciones
            pertenecen a sus respectivos usuarios y no representan
            necesariamente la posición de FriBuk.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Seguimiento de usuarios</h2>

          <p>
            FriBuk puede permitir que los usuarios sigan otros perfiles para
            recibir información sobre su actividad pública dentro de la
            plataforma.
          </p>

          <p>
            Seguir a otro usuario no concede acceso a información privada ni
            permite realizar acciones que el usuario seguido no haya
            autorizado.
          </p>

          <p>
            Las funciones de seguimiento no podrán utilizarse para acosar,
            perseguir o manipular a otros usuarios.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Sistema de recomendaciones y calificaciones</h2>

          <p>
            Las recomendaciones y calificaciones tienen como finalidad
            permitir que los lectores expresen su opinión sobre las obras.
          </p>

          <p>
            Los usuarios no deben utilizar múltiples cuentas o métodos
            fraudulentos para manipular artificialmente estos sistemas.
          </p>

          <p>
            FriBuk podrá detectar y revisar patrones de actividad que indiquen
            manipulación de las funciones de interacción.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Moderación</h2>

          <p>
            FriBuk podrá revisar contenido o actividad cuando exista una razón
            relacionada con:
          </p>

          <ul>
            <li>Seguridad de los usuarios.</li>
            <li>Cumplimiento de estos Términos.</li>
            <li>Denuncias recibidas.</li>
            <li>Derechos de autor.</li>
            <li>Cumplimiento de obligaciones legales.</li>
            <li>Seguridad y funcionamiento de la plataforma.</li>
          </ul>

          <p>
            Las medidas aplicables dependerán de la naturaleza y gravedad de la
            situación.
          </p>

          <p>
            Una infracción no implica necesariamente el cierre inmediato de
            una cuenta.
          </p>

          <p>Dependiendo del caso, FriBuk podrá:</p>

          <ul>
            <li>Emitir una advertencia.</li>
            <li>Solicitar modificaciones al contenido.</li>
            <li>Retirar contenido específico.</li>
            <li>Limitar temporalmente determinadas funciones.</li>
            <li>Suspender temporalmente una cuenta.</li>
            <li>Cerrar una cuenta en casos graves o reiterados.</li>
          </ul>

          <p>
            Las infracciones especialmente graves podrán requerir medidas
            inmediatas.
          </p>
        </section>

        <section className="legal-section">
          <h2>13. Denuncias</h2>

          <p>
            Los usuarios podrán denunciar contenido o comportamientos que
            consideren contrarios a estos Términos o a las demás políticas de
            FriBuk.
          </p>

          <p>
            Las denuncias deberán realizarse de buena fe y proporcionar
            información suficiente para permitir una revisión.
          </p>

          <p>
            El envío de una denuncia no garantiza que el contenido denunciado
            sea eliminado.
          </p>

          <p>
            FriBuk podrá solicitar información adicional cuando sea necesaria
            para evaluar una denuncia.
          </p>
        </section>

        <section className="legal-section">
          <h2>14. Disponibilidad del servicio</h2>

          <p>
            FriBuk busca mantener la plataforma disponible y funcionando
            correctamente, pero no garantiza que el servicio esté disponible
            de forma permanente y sin interrupciones.
          </p>

          <p>Pueden producirse interrupciones debido a:</p>

          <ul>
            <li>Mantenimiento.</li>
            <li>Actualizaciones.</li>
            <li>Problemas técnicos.</li>
            <li>Fallos de proveedores externos.</li>
            <li>Problemas de conectividad.</li>
            <li>Situaciones fuera del control razonable de FriBuk.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>15. Cambios en FriBuk</h2>

          <p>
            FriBuk podrá incorporar, modificar o eliminar funcionalidades de
            la plataforma.
          </p>

          <p>
            Los cambios podrán afectar determinadas características,
            interfaces o herramientas siempre que sean necesarios para
            mejorar, mantener o desarrollar el servicio.
          </p>
        </section>

        <section className="legal-section">
          <h2>16. Modificaciones de estos Términos</h2>

          <p>
            Estos Términos podrán actualizarse cuando sea necesario debido a
            cambios en FriBuk, modificaciones legales o nuevas funcionalidades.
          </p>

          <p>
            Cuando corresponda, FriBuk informará de cambios relevantes mediante
            los mecanismos disponibles en la plataforma.
          </p>

          <p>
            La fecha de última actualización aparecerá al comienzo del
            documento.
          </p>
        </section>

        <section className="legal-section">
          <h2>17. Suspensión o cierre de una cuenta</h2>

          <p>
            El usuario puede dejar de utilizar FriBuk y solicitar el cierre de
            su cuenta mediante los mecanismos que la plataforma disponga.
          </p>

          <p>
            FriBuk también podrá suspender o cerrar una cuenta cuando exista un
            incumplimiento de estos Términos, de las Normas de Comunidad, de la
            Política de Contenido o cuando sea necesario para cumplir
            obligaciones legales o proteger la seguridad de la plataforma y
            sus usuarios.
          </p>

          <p>
            Cuando las circunstancias lo permitan, FriBuk procurará informar al
            usuario sobre la razón de una medida aplicada.
          </p>
        </section>

        <section className="legal-section">
          <h2>18. Responsabilidad sobre el contenido publicado</h2>

          <p>
            FriBuk proporciona la infraestructura y las herramientas para
            publicar contenido, pero cada usuario es responsable de las obras,
            comentarios y demás material que publique.
          </p>

          <p>
            FriBuk no garantiza que las historias publicadas por los usuarios
            sean originales, exactas, completas o libres de conflictos con
            derechos de terceros.
          </p>

          <p>
            La existencia de una obra dentro de FriBuk no constituye una
            certificación de autoría por parte de FriBuk.
          </p>
        </section>

        <section className="legal-section">
          <h2>19. Enlaces y servicios externos</h2>

          <p>
            FriBuk puede utilizar servicios externos necesarios para
            determinadas funciones de la plataforma.
          </p>

          <p>
            El funcionamiento de dichos servicios puede estar sujeto a sus
            propios términos y políticas.
          </p>

          <p>
            Cuando corresponda, FriBuk informará al usuario sobre los servicios
            externos utilizados para proporcionar determinadas funcionalidades.
          </p>
        </section>

        <section className="legal-section">
          <h2>20. Protección de datos personales</h2>

          <p>
            El tratamiento de los datos personales de los usuarios se encuentra
            regulado por la{" "}
            <Link to="/privacidad">Política de Privacidad de FriBuk</Link>.
          </p>

          <p>
            La Política de Privacidad explica qué información se recopila, para
            qué se utiliza, cómo se protege y cuáles son los derechos de los
            usuarios respecto de sus datos personales.
          </p>
        </section>

        <section className="legal-section">
          <h2>21. Edad y uso de la plataforma</h2>

          <p>
            Las condiciones de edad para utilizar FriBuk y determinadas
            funciones dependerán de la legislación aplicable y de las
            características específicas de la plataforma.
          </p>

          <p>
            FriBuk podrá establecer restricciones de edad para determinadas
            categorías de contenido o funcionalidades.
          </p>

          <p>
            Los usuarios no deben proporcionar información falsa sobre su edad
            con el objetivo de acceder a contenido o funciones restringidas.
          </p>
        </section>

        <section className="legal-section">
          <h2>22. Legislación aplicable</h2>

          <p>
            Estos Términos deberán interpretarse de acuerdo con la legislación
            aplicable al funcionamiento de FriBuk y a la relación con sus
            usuarios.
          </p>

          <p>
            Cuando corresponda, FriBuk procurará cumplir las normas chilenas
            aplicables a la prestación de servicios digitales, protección de
            datos personales, derechos de los consumidores y propiedad
            intelectual.
          </p>
        </section>

        <section className="legal-section">
          <h2>23. Contacto</h2>

          <p>
            Los usuarios podrán contactar a FriBuk mediante los canales
            oficiales que la plataforma habilite para consultas, denuncias,
            solicitudes relacionadas con sus datos personales, derechos de
            autor y otros asuntos relacionados con el servicio.
          </p>
        </section>

      </div>

      <SiteFooter />
    </div>
  );
}