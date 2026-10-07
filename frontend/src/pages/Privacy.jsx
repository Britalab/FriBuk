import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Privacy() {
  return (
    <main className="legal-page">
      <div className="legal-container">

        <Link to="/" className="legal-back">
          ← Volver a FriBuk
        </Link>

        <header className="legal-header">
          <span className="legal-label">POLÍTICA</span>
          <h1>Política de Privacidad</h1>
          <p className="legal-date">
            Última actualización: septiembre de 2026
          </p>
        </header>

        <p className="legal-intro">
          En FriBuk valoramos la privacidad de las personas que utilizan
          nuestra plataforma. Esta Política de Privacidad explica qué
          información podemos recopilar, para qué la utilizamos, cómo la
          protegemos y qué derechos pueden ejercer los usuarios respecto de
          sus datos personales.
        </p>

        <p className="legal-intro">
          FriBuk está pensado para personas de distintos países y regiones,
          especialmente dentro de la comunidad hispanohablante. Por esta razón,
          el tratamiento de datos personales se realizará teniendo en cuenta
          las leyes y regulaciones que resulten aplicables según la jurisdicción
          correspondiente.
        </p>

        <section className="legal-section">
          <h2>1. Alcance de esta política</h2>

          <p>
            Esta Política de Privacidad se aplica a la información relacionada
            con las personas que utilizan FriBuk, incluyendo quienes crean una
            cuenta, publican historias, escriben capítulos, comentan, califican,
            recomiendan, siguen a otros usuarios o interactúan con las
            funcionalidades de la plataforma.
          </p>

          <p>
            Esta política debe leerse junto con los Términos y Condiciones, las
            Normas de Comunidad y las demás políticas de FriBuk.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Datos personales</h2>

          <p>
            Los datos personales son aquellos que permiten identificar o hacer
            identificable a una persona, directa o indirectamente.
          </p>

          <p>
            FriBuk procura recopilar únicamente la información que resulte
            necesaria o pertinente para proporcionar, proteger y mejorar sus
            servicios.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Información que podemos recopilar</h2>

          <p>
            Dependiendo de las funcionalidades que utilice una persona, FriBuk
            puede tratar información como:
          </p>

          <ul>
            <li>Nombre de usuario.</li>
            <li>Dirección de correo electrónico asociada a la cuenta.</li>
            <li>Información que el usuario decida incluir en su perfil.</li>
            <li>Historias y capítulos publicados.</li>
            <li>Comentarios realizados dentro de la plataforma.</li>
            <li>Votos, recomendaciones y calificaciones.</li>
            <li>Relaciones de seguimiento entre usuarios.</li>
            <li>Información necesaria para gestionar la cuenta y la sesión.</li>
            <li>Información técnica relacionada con el funcionamiento y seguridad del servicio.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Información que proporcionas voluntariamente</h2>

          <p>
            Parte de la información tratada por FriBuk es proporcionada
            directamente por el usuario al crear una cuenta o utilizar la
            plataforma.
          </p>

          <p>
            Esto puede incluir información del perfil, biografía, imágenes,
            historias, capítulos, comentarios y otros contenidos que la persona
            decida publicar.
          </p>

          <div className="legal-highlight">
            <strong>Importante:</strong> cualquier información que publiques
            voluntariamente en una sección pública de FriBuk puede ser visible
            para otros usuarios.
          </div>
        </section>

        <section className="legal-section">
          <h2>5. Información de la cuenta y autenticación</h2>

          <p>
            FriBuk utiliza servicios tecnológicos de autenticación para permitir
            el registro, inicio de sesión y administración segura de las
            cuentas.
          </p>

          <p>
            La información necesaria para autenticar una cuenta puede ser
            procesada mediante proveedores tecnológicos utilizados por FriBuk.
          </p>

          <p>
            FriBuk no pretende almacenar contraseñas de usuarios en texto
            visible.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Para qué utilizamos los datos</h2>

          <p>
            La información personal puede ser utilizada para finalidades
            relacionadas con el funcionamiento de FriBuk, incluyendo:
          </p>

          <ul>
            <li>Crear y administrar cuentas.</li>
            <li>Permitir el inicio de sesión y autenticación.</li>
            <li>Administrar perfiles de usuario.</li>
            <li>Publicar y organizar historias y capítulos.</li>
            <li>Permitir comentarios e interacciones.</li>
            <li>Gestionar votos, recomendaciones y calificaciones.</li>
            <li>Permitir el seguimiento entre usuarios.</li>
            <li>Mostrar contenido y funcionalidades personalizadas cuando corresponda.</li>
            <li>Proteger la seguridad de la plataforma.</li>
            <li>Detectar y prevenir usos abusivos, fraudulentos o no autorizados.</li>
            <li>Gestionar denuncias y solicitudes relacionadas con el contenido.</li>
            <li>Corregir errores y mejorar las funcionalidades de FriBuk.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>7. Principio de minimización</h2>

          <p>
            FriBuk procurará limitar la recopilación y utilización de datos a
            aquellos que sean pertinentes para las finalidades informadas o
            necesarios para proporcionar y proteger el servicio.
          </p>

          <p>
            FriBuk no pretende recopilar información personal simplemente por
            el hecho de que técnicamente sea posible hacerlo.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Información pública</h2>

          <p>
            Algunas funcionalidades de FriBuk están diseñadas para ser
            públicas. Dependiendo de la configuración y características de la
            plataforma, otros usuarios pueden visualizar información como el
            nombre de usuario, perfil público, historias, capítulos y
            determinadas interacciones.
          </p>

          <p>
            Los usuarios deben considerar cuidadosamente qué información
            personal deciden publicar en espacios públicos.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Historias, capítulos y contenido publicado</h2>

          <p>
            Las historias, capítulos, comentarios, imágenes y otros contenidos
            publicados pueden ser almacenados, procesados y mostrados por FriBuk
            para proporcionar las funcionalidades correspondientes.
          </p>

          <p>
            La publicación de una obra puede asociarla públicamente con el
            nombre de usuario de su autor.
          </p>

          <p>
            La información que forma parte del contenido publicado por el
            usuario puede permanecer visible mientras la publicación se
            encuentre disponible en FriBuk, de acuerdo con las funcionalidades
            y políticas de la plataforma.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Comentarios, votos, calificaciones y seguimiento</h2>

          <p>
            FriBuk puede almacenar información relacionada con las
            interacciones realizadas dentro de la plataforma.
          </p>

          <p>
            Esto incluye comentarios, votos, recomendaciones, calificaciones y
            relaciones de seguimiento entre usuarios.
          </p>

          <p>
            Estas interacciones permiten proporcionar las funciones sociales,
            de descubrimiento y evaluación de contenido disponibles en FriBuk.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Información técnica</h2>

          <p>
            Para mantener el funcionamiento, estabilidad y seguridad de FriBuk,
            pueden procesarse determinados datos técnicos relacionados con el uso
            del servicio.
          </p>

          <p>
            Esta información puede utilizarse para detectar errores, investigar
            problemas técnicos, prevenir abusos, proteger cuentas y mantener la
            infraestructura.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Almacenamiento local y tecnologías similares</h2>

          <p>
            FriBuk puede utilizar mecanismos de almacenamiento del navegador,
            como almacenamiento local u otras tecnologías similares, cuando sean
            necesarios para proporcionar determinadas funcionalidades.
          </p>

          <p>
            Por ejemplo, pueden utilizarse para conservar información técnica
            relacionada con la sesión de autenticación del usuario.
          </p>

          <p>
            El uso de estas tecnologías podrá cambiar a medida que evolucionen
            las funcionalidades de FriBuk.
          </p>
        </section>

        <section className="legal-section">
          <h2>13. Proveedores tecnológicos</h2>

          <p>
            FriBuk puede utilizar proveedores externos para proporcionar
            servicios necesarios para el funcionamiento de la plataforma.
          </p>

          <p>
            Estos servicios pueden incluir autenticación, alojamiento,
            almacenamiento, bases de datos, infraestructura, seguridad u otras
            funciones tecnológicas.
          </p>

          <p>
            Estos proveedores podrán tratar información únicamente en la medida
            necesaria para prestar los servicios correspondientes y conforme a
            los acuerdos y condiciones aplicables.
          </p>
        </section>

        <section className="legal-section">
          <h2>14. Transferencias internacionales</h2>

          <p>
            Debido a la naturaleza global de Internet y al uso de proveedores
            tecnológicos internacionales, determinados datos pueden ser
            almacenados o procesados en un país distinto al país donde se
            encuentra el usuario.
          </p>

          <p>
            Cuando exista una transferencia internacional de datos, FriBuk
            procurará utilizar mecanismos y medidas de protección apropiados
            conforme a las obligaciones que resulten aplicables.
          </p>
        </section>

        <section className="legal-section">
          <h2>15. Seguridad de la información</h2>

          <p>
            FriBuk procurará aplicar medidas técnicas y organizativas razonables
            para proteger los datos personales frente a accesos no autorizados,
            pérdida, alteración, divulgación indebida u otros riesgos.
          </p>

          <p>
            Estas medidas pueden incluir controles de autenticación, protección
            de comunicaciones, restricciones de acceso y mecanismos de
            seguridad sobre la infraestructura utilizada por la plataforma.
          </p>

          <div className="legal-highlight">
            <strong>Importante:</strong> ningún servicio conectado a Internet
            puede garantizar una seguridad absoluta. FriBuk trabajará para
            reducir los riesgos y responder ante incidentes cuando corresponda.
          </div>
        </section>

        <section className="legal-section">
          <h2>16. Conservación de los datos</h2>

          <p>
            FriBuk podrá conservar información personal durante el tiempo
            necesario para proporcionar sus servicios, mantener la seguridad,
            cumplir obligaciones aplicables, resolver conflictos o atender
            otras finalidades legítimas relacionadas con la operación de la
            plataforma.
          </p>

          <p>
            Cuando la información deje de ser necesaria y no exista una razón
            válida para conservarla, FriBuk podrá eliminarla, anonimizarla o
            aplicar otras medidas apropiadas.
          </p>
        </section>

        <section className="legal-section">
          <h2>17. Eliminación de cuentas</h2>

          <p>
            FriBuk podrá ofrecer mecanismos para solicitar o realizar la
            eliminación de una cuenta, de acuerdo con las funcionalidades
            disponibles en la plataforma.
          </p>

          <p>
            La eliminación de una cuenta no necesariamente implica la
            eliminación inmediata de toda la información relacionada con ella.
          </p>

          <p>
            Determinados datos podrán conservarse cuando exista una obligación
            legal, una necesidad de seguridad, la prevención de fraude, la
            resolución de conflictos u otra razón legítima que permita o exija
            su conservación.
          </p>
        </section>

        <section className="legal-section">
          <h2>18. Derechos sobre los datos personales</h2>

          <p>
            Los usuarios pueden tener determinados derechos respecto de sus
            datos personales dependiendo del país, región o legislación que
            resulte aplicable.
          </p>

          <p>
            Estos derechos pueden incluir, según corresponda:
          </p>

          <ul>
            <li>Solicitar acceso a los datos personales.</li>
            <li>Solicitar la corrección de información incorrecta o desactualizada.</li>
            <li>Solicitar la eliminación o supresión de determinados datos.</li>
            <li>Oponerse a determinados tratamientos.</li>
            <li>Solicitar la limitación o bloqueo del tratamiento cuando corresponda.</li>
            <li>Solicitar la portabilidad de determinados datos cuando este derecho resulte aplicable.</li>
            <li>Retirar un consentimiento cuando el tratamiento se base en dicho consentimiento.</li>
          </ul>

          <p>
            El ejercicio de estos derechos estará sujeto a las condiciones,
            excepciones y procedimientos establecidos por la legislación
            aplicable.
          </p>
        </section>

        <section className="legal-section">
          <h2>19. Menores de edad</h2>

          <p>
            FriBuk reconoce que la privacidad de niños, niñas y adolescentes
            requiere especial protección.
          </p>

          <p>
            Las reglas de edad, consentimiento y tratamiento de datos de
            menores pueden variar entre países. FriBuk aplicará las restricciones
            y medidas que correspondan según la legislación aplicable y las
            características del servicio.
          </p>

          <p>
            Cuando la legislación requiera autorización de un representante
            legal para determinadas actividades, FriBuk podrá establecer
            mecanismos destinados a cumplir dicho requisito.
          </p>
        </section>

        <section className="legal-section">
          <h2>20. Datos sensibles</h2>

          <p>
            FriBuk no solicita como requisito general información sensible que
            no sea necesaria para utilizar sus servicios.
          </p>

          <p>
            Los usuarios deben evitar publicar voluntariamente información
            sensible propia o de terceros cuando no sea necesario hacerlo.
          </p>

          <p>
            FriBuk podrá aplicar medidas adicionales cuando una legislación
            aplicable establezca requisitos especiales para determinadas
            categorías de datos.
          </p>
        </section>

        <section className="legal-section">
          <h2>21. Información de otras personas</h2>

          <p>
            Los usuarios no deben utilizar FriBuk para recopilar, publicar o
            divulgar información personal de otras personas sin autorización o
            sin una base legítima que permita hacerlo.
          </p>

          <p>
            Esto incluye, entre otros, datos de contacto privados, credenciales,
            documentos de identificación, información financiera, ubicación
            precisa u otra información que pueda afectar significativamente la
            privacidad de una persona.
          </p>
        </section>

        <section className="legal-section">
          <h2>22. Incidentes de seguridad</h2>

          <p>
            Si FriBuk detecta un incidente de seguridad que pueda afectar datos
            personales, podrá adoptar medidas para contenerlo, investigar sus
            causas, reducir sus efectos y aplicar las obligaciones de
            comunicación que correspondan conforme a la legislación aplicable.
          </p>
        </section>

        <section className="legal-section">
          <h2>23. Cambios en esta política</h2>

          <p>
            FriBuk podrá actualizar esta Política de Privacidad cuando existan
            cambios en la plataforma, nuevas funcionalidades, modificaciones en
            los servicios utilizados o cambios en las obligaciones legales
            aplicables.
          </p>

          <p>
            La fecha de actualización será modificada cuando se publique una
            nueva versión.
          </p>
        </section>

        <section className="legal-section">
          <h2>24. Legislación aplicable</h2>

          <p>
            El tratamiento de datos personales realizado por FriBuk estará
            sujeto a las leyes y regulaciones que resulten aplicables según el
            país, región, ubicación del usuario y circunstancias del
            tratamiento.
          </p>

          <p>
            FriBuk procurará adaptar sus prácticas y mecanismos de privacidad
            cuando resulte necesario para cumplir las obligaciones aplicables
            en las jurisdicciones donde opere.
          </p>

          <p>
            Esta política establece principios generales para la plataforma y
            no reemplaza las disposiciones específicas que puedan establecer
            las leyes de cada jurisdicción.
          </p>
        </section>

        <section className="legal-section">
          <h2>25. Contacto y solicitudes de privacidad</h2>

          <p>
            FriBuk habilitará canales de contacto para consultas relacionadas
            con privacidad y protección de datos personales.
          </p>

          <p>
            Las personas podrán utilizar estos canales para realizar consultas,
            solicitar información sobre el tratamiento de sus datos o ejercer
            los derechos que les correspondan conforme a la legislación
            aplicable.
          </p>

          <p>
            Las solicitudes deberán proporcionar información suficiente para
            identificar la cuenta o situación correspondiente, evitando incluir
            información personal innecesaria.
          </p>
        </section>

      </div>

      <SiteFooter />
    </main>
  );
}