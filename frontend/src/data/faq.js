// Preguntas frecuentes de FriBuk.
//
// Es una sola lista para la página (/preguntas-frecuentes) y para la versión
// que reciben los buscadores (frontend/server/faqPage.js). Las respuestas
// son texto plano; `link` agrega un enlace al final.
//
// Cada respuesta describe algo que el sitio hace hoy o que dicen sus
// políticas: al cambiar una función, hay que revisar su respuesta.
export const FAQ = [
  {
    question: "¿Qué es FriBuk?",
    answer:
      "FriBuk es una plataforma para leer, escribir y descubrir historias y fanfics creados por su propia comunidad. Cualquier persona puede publicar su historia por capítulos, y quienes leen pueden comentar, recomendar, valorar y seguir a sus autoras y autores.",
  },
  {
    question: "¿FriBuk es gratis?",
    answer:
      "Sí. Crear una cuenta, leer y publicar historias en FriBuk no tiene costo.",
  },
  {
    question: "¿Necesito una cuenta para leer?",
    answer:
      "No. Las historias publicadas se pueden leer sin cuenta. Necesitas una cuenta para publicar, comentar, guardar historias en favoritos, seguir a otras personas y para que FriBuk recuerde por dónde vas leyendo.",
    link: { to: "/register", label: "Crear una cuenta" },
  },
  {
    question: "¿Puedo publicar fanfics?",
    answer:
      "Sí. Al crear tu historia puedes indicar que es un fanfic y señalar la obra original y su autor. Las historias basadas en otros universos deben respetar la Política de Derechos de Autor.",
    link: { to: "/derechos-autor", label: "Política de Derechos de Autor" },
  },
  {
    question: "¿De quién son las historias que publico en FriBuk?",
    answer:
      "Tuyas. Publicar una obra en FriBuk no transfiere su propiedad: conservas los derechos que te correspondan sobre ella. FriBuk solo recibe la autorización necesaria para guardarla y mostrarla dentro de la plataforma.",
    link: { to: "/terminos", label: "Términos y Condiciones" },
  },
  {
    question: "¿Qué tipo de contenido se puede publicar?",
    answer:
      "Historias de casi cualquier género: romance, fantasía, ciencia ficción, misterio, terror, drama y muchos más. Las historias con temas sensibles deben marcar la advertencia de contenido al publicarse. No se permite, bajo ninguna clasificación, contenido sexual que involucre a menores de edad ni contenido prohibido por la ley.",
    link: { to: "/contenido", label: "Política de Contenido" },
  },
  {
    question: "¿Cómo publico mi historia?",
    answer:
      "Con tu sesión iniciada, pulsa «Crear historia», completa el título, la sinopsis y el género, y luego agrega capítulos. Puedes guardar la historia y cada capítulo como borrador: mientras estén en borrador solo tú puedes verlos.",
  },
  {
    question: "¿Cómo comento una historia?",
    answer:
      "Mientras lees un capítulo, haz doble clic sobre un párrafo (o tócalo dos veces en el teléfono) para comentarlo. Al final de cada capítulo también hay un espacio, «¿Qué te pareció este capítulo?», para comentarlo completo.",
  },
  {
    question: "¿FriBuk recuerda por dónde voy leyendo?",
    answer:
      "Sí. Si tienes la sesión iniciada, FriBuk guarda tu avance y te lleva al punto donde quedaste cuando vuelves al capítulo. En el inicio encontrarás tus lecturas en «Seguir leyendo».",
  },
  {
    question: "¿Puedo enviarle mensajes a otras personas?",
    answer:
      "Sí. FriBuk tiene mensajes privados entre usuarios. Cada persona decide quién puede escribirle y puede bloquear a quien no quiera recibir.",
  },
  {
    question: "¿Cómo reporto contenido inapropiado?",
    answer:
      "Las publicaciones del foro, las imágenes de perfil y las portadas tienen un botón «Reportar». Para cualquier otro caso puedes escribir al Centro de ayuda. Un reporte no elimina el contenido automáticamente: primero se revisa.",
    link: { to: "/moderacion", label: "Política de Moderación" },
  },
  {
    question: "Olvidé mi contraseña, ¿qué hago?",
    answer:
      "En la pantalla de inicio de sesión, pulsa «¿Olvidaste tu contraseña?» y escribe tu correo. Te llegará un enlace para crear una contraseña nueva.",
    link: { to: "/recuperar", label: "Recuperar contraseña" },
  },
  {
    question: "¿Cómo pido ayuda o elimino mi cuenta?",
    answer:
      "Escribe al Centro de ayuda contando qué necesitas. Ahí puedes pedir ayuda con tu cuenta, reportar un problema o solicitar que tu cuenta sea eliminada.",
    link: { to: "/support", label: "Centro de ayuda" },
  },
];
