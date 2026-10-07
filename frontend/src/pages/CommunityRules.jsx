import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function CommunityRules() {
  return (
    <div className="legal-page">
      <div className="legal-container">

        <Link to="/" className="legal-back">
          ← Volver a FriBuk
        </Link>

        <header className="legal-header">
          <span className="legal-label">FRIBUK</span>
          <h1>Normas de Comunidad</h1>
          <p className="legal-date">
            Última actualización: septiembre de 2026
          </p>
        </header>

        <div className="legal-intro">
          <p>
            FriBuk busca ser un espacio donde las personas puedan leer,
            escribir, descubrir historias y compartir sus propias obras.
          </p>

          <p>
            Estas Normas de Comunidad establecen las conductas que esperamos
            de quienes utilizan la plataforma. Se aplican a perfiles,
            historias, capítulos, comentarios, mensajes, valoraciones,
            recomendaciones, follows y demás funciones disponibles en FriBuk.
          </p>
        </div>

        <section className="legal-section">
          <h2>1. Trato respetuoso</h2>

          <p>
            Las personas pueden tener opiniones, gustos y puntos de vista
            diferentes.
          </p>

          <p>
            No está permitido utilizar FriBuk para acosar, humillar,
            intimidar o perseguir a otros usuarios.
          </p>

          <p>
            Las críticas sobre una historia pueden ser negativas, siempre que
            se expresen de manera respetuosa y estén dirigidas al contenido,
            no a atacar personalmente a su autor.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Acoso y hostigamiento</h2>

          <p>No está permitido:</p>

          <ul>
            <li>
              Insultar repetidamente a una persona con intención de hostigarla.
            </li>
            <li>
              Perseguir a un usuario mediante comentarios o interacciones
              constantes no deseadas.
            </li>
            <li>
              Utilizar varias cuentas para acosar a una persona.
            </li>
            <li>
              Crear campañas de hostigamiento contra otro usuario.
            </li>
            <li>
              Amenazar o intimidar a otros usuarios.
            </li>
            <li>
              Utilizar las funciones de FriBuk para provocar deliberadamente
              una reacción de miedo o angustia.
            </li>
          </ul>

          <p>
            Una discusión aislada no constituye necesariamente acoso. FriBuk
            podrá considerar el contexto, la frecuencia y la intención
            aparente de la conducta.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Discriminación y ataques dirigidos</h2>

          <p>
            FriBuk no debe utilizarse para atacar, humillar o promover
            hostilidad contra personas por características personales
            protegidas por la legislación aplicable.
          </p>

          <p>
            No está permitido utilizar la plataforma para promover violencia
            o discriminación contra grupos de personas.
          </p>

          <p>
            Las obras de ficción pueden abordar conflictos, prejuicios o
            discriminación como parte de una historia. La representación de un
            tema dentro de una obra no significa necesariamente que el autor
            esté promoviendo dicho comportamiento.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Amenazas y violencia real</h2>

          <p>
            No está permitido utilizar FriBuk para realizar amenazas reales
            contra una persona o grupo.
          </p>

          <p>
            Las amenazas creíbles, el contenido destinado a facilitar
            violencia real o la coordinación de actos violentos podrán ser
            retirados y podrán dar lugar a medidas sobre la cuenta
            correspondiente.
          </p>

          <p>
            La violencia ficticia dentro de una obra literaria no se considera
            automáticamente una amenaza real.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Privacidad</h2>

          <p>
            Respeta la privacidad de los demás usuarios.
          </p>

          <p>
            No publiques información personal de otra persona sin autorización.
          </p>

          <p>Esto incluye, entre otros:</p>

          <ul>
            <li>Direcciones particulares.</li>
            <li>Números telefónicos.</li>
            <li>Información bancaria.</li>
            <li>Contraseñas.</li>
            <li>Credenciales de acceso.</li>
            <li>Información privada obtenida sin autorización.</li>
            <li>
              Fotografías privadas compartidas sin permiso.
            </li>
            <li>
              Información que permita localizar deliberadamente a una persona.
            </li>
          </ul>

          <p>
            FriBuk podrá retirar contenido que exponga información personal de
            terceros.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Información personal propia</h2>

          <p>
            Los usuarios también deben tener precaución al publicar información
            sobre sí mismos.
          </p>

          <p>
            No es recomendable publicar públicamente información que pueda
            comprometer la seguridad personal, como direcciones particulares,
            contraseñas, documentos de identidad o información financiera.
          </p>

          <p>
            Cada usuario es responsable de la información que decide hacer
            pública.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Spam y publicidad</h2>

          <p>
            No está permitido utilizar FriBuk para inundar la plataforma con
            contenido repetitivo o interacciones no solicitadas.
          </p>

          <p>Esto incluye:</p>

          <ul>
            <li>Publicar repetidamente el mismo contenido.</li>
            <li>
              Crear múltiples cuentas para promocionar una obra artificialmente.
            </li>
            <li>
              Publicar comentarios promocionales de forma masiva.
            </li>
            <li>
              Utilizar las funciones de FriBuk exclusivamente para enviar
              publicidad no solicitada.
            </li>
            <li>
              Utilizar sistemas automatizados para generar actividad falsa.
            </li>
          </ul>

          <p>
            Las colaboraciones o promociones autorizadas por FriBuk podrán
            estar sujetas a reglas específicas.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Suplantación de identidad</h2>

          <p>
            No está permitido hacerse pasar deliberadamente por otra persona,
            autor, organización o miembro del equipo de FriBuk con intención
            de engañar o perjudicar.
          </p>

          <p>
            Los usuarios pueden utilizar nombres artísticos o seudónimos
            siempre que no se utilicen para suplantar deliberadamente a otra
            persona.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Cuentas falsas y manipulación de la plataforma</h2>

          <p>
            No está permitido crear cuentas con el objetivo de manipular
            artificialmente las funciones de FriBuk.
          </p>

          <p>Esto incluye utilizar múltiples cuentas para:</p>

          <ul>
            <li>Aumentar artificialmente seguidores.</li>
            <li>Manipular recomendaciones.</li>
            <li>Manipular calificaciones.</li>
            <li>Manipular votos.</li>
            <li>Generar comentarios falsos.</li>
            <li>
              Evadir una medida de moderación aplicada a otra cuenta.
            </li>
          </ul>

          <p>
            FriBuk podrá revisar patrones de actividad que indiquen
            manipulación coordinada de la plataforma.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Comentarios</h2>

          <p>
            Los comentarios deben contribuir a una interacción razonable entre
            lectores y autores.
          </p>

          <p>Está permitido:</p>

          <ul>
            <li>Expresar opiniones negativas sobre una historia.</li>
            <li>Señalar errores.</li>
            <li>Criticar aspectos de una obra.</li>
            <li>Expresar desacuerdo con decisiones narrativas.</li>
            <li>Compartir interpretaciones diferentes.</li>
          </ul>

          <p>No está permitido utilizar los comentarios para:</p>

          <ul>
            <li>Amenazar al autor.</li>
            <li>Acosarlo.</li>
            <li>Publicar información privada.</li>
            <li>Realizar spam.</li>
            <li>Promover actividades ilegales.</li>
            <li>
              Generar deliberadamente conflictos mediante ataques personales.
            </li>
          </ul>

          <p>
            Una crítica negativa no constituye por sí misma una infracción.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Contenido sexual y contenido adulto</h2>

          <p>
            FriBuk puede permitir historias destinadas a un público adulto
            cuando sean legales y cumplan las políticas de la plataforma.
          </p>

          <p>
            Las obras que contengan contenido adulto deberán utilizar las
            advertencias o clasificaciones correspondientes cuando FriBuk
            disponga de estas herramientas.
          </p>

          <p>No está permitido:</p>

          <ul>
            <li>Sexualizar o explotar a menores.</li>
            <li>Publicar material de abuso sexual infantil.</li>
            <li>
              Utilizar la plataforma para facilitar explotación sexual.
            </li>
            <li>Presentar contenido sexual ilegal.</li>
            <li>
              Utilizar contenido sexual para acosar a usuarios reales.
            </li>
          </ul>

          <div className="legal-highlight">
            <strong>
              El contenido adulto permitido no implica automáticamente la
              eliminación de la cuenta del usuario.
            </strong>
          </div>

          <p>
            FriBuk podrá aplicar restricciones de visibilidad o clasificación
            a determinadas obras.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Crueldad y maltrato animal</h2>

          <p>
            FriBuk no permite contenido que promueva deliberadamente la
            crueldad o el maltrato grave hacia animales.
          </p>

          <p>
            Tampoco se permite la publicación de representaciones gráficas
            centradas en torturar animales.
          </p>

          <p>
            Las historias pueden contener animales, situaciones de peligro o
            conflictos propios de determinados géneros literarios. La mera
            presencia de violencia contra un animal dentro de una historia no
            implica automáticamente una infracción.
          </p>

          <p>
            FriBuk podrá evaluar el contexto y el tratamiento del contenido.
          </p>
        </section>

        <section className="legal-section">
          <h2>13. Contenido ilegal</h2>

          <p>
            No está permitido utilizar FriBuk para publicar contenido cuyo
            propósito sea facilitar, coordinar o promover actividades ilegales.
          </p>

          <p>Esto incluye, entre otras conductas:</p>

          <ul>
            <li>Instrucciones destinadas a cometer delitos.</li>
            <li>Amenazas reales.</li>
            <li>Explotación de personas.</li>
            <li>Distribución de material ilegal.</li>
            <li>Fraude.</li>
            <li>
              Actividades destinadas a perjudicar deliberadamente a otras
              personas.
            </li>
          </ul>

          <p>
            La representación ficticia de delitos dentro de una obra literaria
            no constituye automáticamente una infracción.
          </p>
        </section>

        <section className="legal-section">
          <h2>14. Plagio y derechos de autor</h2>

          <p>
            Los usuarios deben publicar contenido sobre el cual tengan los
            derechos o permisos necesarios.
          </p>

          <p>No está permitido:</p>

          <ul>
            <li>
              Copiar deliberadamente una obra ajena y presentarla como propia.
            </li>
            <li>
              Publicar capítulos de otra persona sin autorización.
            </li>
            <li>
              Utilizar FriBuk para distribuir material protegido por derechos
              de autor sin autorización.
            </li>
            <li>
              Presentar deliberadamente una obra ajena como creación propia.
            </li>
          </ul>

          <p>
            Las denuncias relacionadas con derechos de autor serán tratadas de
            acuerdo con la Política de Derechos de Autor de FriBuk.
          </p>
        </section>

        <section className="legal-section">
          <h2>15. Historias y personajes ficticios</h2>

          <p>
            FriBuk es una plataforma literaria.
          </p>

          <p>
            Una historia puede representar personajes, situaciones, conflictos
            o conductas que no serían apropiados fuera de una obra de ficción.
          </p>

          <p>
            La existencia de una conducta dentro de una historia no significa
            automáticamente que el usuario esté promoviendo dicha conducta en
            la vida real.
          </p>

          <p>
            Para evaluar posibles infracciones, FriBuk podrá considerar el
            contexto completo de la obra, su clasificación, su presentación y
            la naturaleza del contenido.
          </p>
        </section>

        <section className="legal-section">
          <h2>16. Denuncias de contenido</h2>

          <p>
            Los usuarios pueden denunciar contenido o comportamientos que
            consideren contrarios a estas Normas de Comunidad.
          </p>

          <p>
            Una denuncia debería incluir información suficiente para que FriBuk
            pueda identificar y revisar el contenido correspondiente.
          </p>

          <p>
            Las denuncias falsas realizadas deliberadamente para perjudicar a
            otro usuario también pueden ser consideradas un uso indebido de
            las herramientas de moderación.
          </p>

          <p>
            Una denuncia no implica automáticamente que el contenido será
            eliminado.
          </p>
        </section>

        <section className="legal-section">
          <h2>17. Revisión de denuncias</h2>

          <p>Cuando sea necesario, FriBuk podrá revisar:</p>

          <ul>
            <li>La publicación denunciada.</li>
            <li>Los comentarios relacionados.</li>
            <li>El contexto de la interacción.</li>
            <li>La actividad asociada a la cuenta.</li>
            <li>El historial de infracciones relevante.</li>
          </ul>

          <p>
            La finalidad de la revisión será determinar si existe un
            incumplimiento de las políticas de FriBuk y qué medida corresponde.
          </p>
        </section>

        <section className="legal-section">
          <h2>18. Medidas ante incumplimientos</h2>

          <p>
            FriBuk busca aplicar medidas proporcionales a la naturaleza de cada
            situación.
          </p>

          <p>
            Dependiendo de la gravedad, frecuencia y contexto, FriBuk podrá:
          </p>

          <ul>
            <li>Emitir una advertencia.</li>
            <li>Solicitar cambios en una publicación.</li>
            <li>Retirar una publicación específica.</li>
            <li>Limitar temporalmente una función.</li>
            <li>Suspender temporalmente una cuenta.</li>
            <li>Cerrar una cuenta en casos graves o reiterados.</li>
          </ul>

          <p>
            No todas las infracciones tendrán necesariamente la misma
            consecuencia.
          </p>

          <p>
            Las situaciones que representen un riesgo grave para otros
            usuarios, involucren contenido ilegal o requieran una respuesta
            inmediata podrán recibir medidas más severas.
          </p>
        </section>

        <section className="legal-section">
          <h2>19. Reincidencia</h2>

          <p>
            Cuando un usuario incumpla repetidamente las Normas de Comunidad,
            FriBuk podrá considerar su historial al determinar nuevas medidas.
          </p>

          <p>
            La reincidencia puede dar lugar a restricciones o suspensiones más
            prolongadas.
          </p>

          <p>
            El objetivo de estas medidas es proteger la comunidad y evitar que
            las mismas conductas continúen afectando a otros usuarios.
          </p>
        </section>

        <section className="legal-section">
          <h2>20. Evasión de medidas</h2>

          <p>
            No está permitido utilizar otra cuenta para evadir deliberadamente
            una suspensión, restricción o cierre aplicado por FriBuk.
          </p>

          <p>
            La creación de una nueva cuenta con el único propósito de continuar
            una conducta que ya fue objeto de una medida podrá considerarse una
            infracción adicional.
          </p>
        </section>

        <section className="legal-section">
          <h2>21. Cambios en las Normas de Comunidad</h2>

          <p>
            Estas Normas podrán actualizarse cuando FriBuk incorpore nuevas
            funciones, modifique sus sistemas de moderación o deba adaptarse a
            cambios legales.
          </p>

          <p>
            La fecha de última actualización aparecerá al comienzo del
            documento.
          </p>
        </section>

        <section className="legal-section">
          <h2>22. Principio general</h2>

          <p>
            FriBuk busca mantener una comunidad donde las personas puedan
            escribir, leer y compartir historias con libertad, siempre dentro
            de límites destinados a proteger a los usuarios y el funcionamiento
            de la plataforma.
          </p>

          <p>
            El objetivo de estas normas no es controlar las opiniones, estilos
            literarios o géneros de los autores, sino establecer límites claros
            frente a conductas que puedan perjudicar a otros usuarios, vulnerar
            derechos o utilizar la plataforma de manera abusiva.
          </p>
        </section>

      </div>

      <SiteFooter />
    </div>
  );
}

