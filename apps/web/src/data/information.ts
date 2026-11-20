export interface InformationPage { title: string; description: string; links?: { label: string; href: string }[] }

export const informationPages: Record<string, InformationPage> = {
  ayuda: { title: 'Centro de ayuda', description: 'Encuentra alojamientos, consulta tus reservas o administra tu perfil desde las siguientes secciones.', links: [{ label: 'Buscar alojamientos', href: '/search' }, { label: 'Mis reservas', href: '/bookings' }, { label: 'Mi perfil', href: '/profile' }] },
  seguridad: { title: 'Información de seguridad', description: 'Protege tu cuenta: usa una contraseña única y no compartas tus credenciales. Consulta los detalles y las condiciones de cada alojamiento antes de reservar.' },
  cancelaciones: { title: 'Opciones de cancelación', description: 'Puedes consultar tus reservas y solicitar la cancelación desde su detalle. La política aplicable y el estado del reembolso dependen de la reserva.', links: [{ label: 'Ver mis reservas', href: '/bookings' }] },
  comunidad: { title: 'StayHub.org', description: 'Aquí encontrarás información de la comunidad StayHub cuando esté disponible.' },
  referidos: { title: 'Programa de referidos', description: 'El programa de referidos todavía no está disponible.' },
  accesibilidad: { title: 'Viajeros accesibles', description: 'Consulta las características de cada alojamiento en su ficha antes de reservar. La información específica de accesibilidad puede no estar disponible para todas las propiedades.', links: [{ label: 'Buscar alojamientos', href: '/search' }] },
  anfitriones: { title: 'Recursos para anfitriones', description: 'Desde el panel de anfitrión puedes administrar tus propiedades, reservas y reportes.', links: [{ label: 'Ir al panel de anfitrión', href: '/host' }, { label: 'Publicar un alojamiento', href: '/host/new' }] },
  prensa: { title: 'Sala de prensa', description: 'Todavía no hay comunicados de prensa publicados.' },
  blog: { title: 'Blog de viajes', description: 'Todavía no hay artículos publicados.' },
  empleo: { title: 'Trabaja con nosotros', description: 'Todavía no hay vacantes publicadas.' },
  privacidad: { title: 'Privacidad', description: 'La política de privacidad de este entorno todavía no está publicada. Evita compartir información personal innecesaria.' },
  condiciones: { title: 'Condiciones', description: 'Las condiciones de uso de este entorno todavía no están publicadas.' },
  empresa: { title: 'Empresa', description: 'La información institucional de StayHub todavía no está publicada.' },
};

export const footerColumns = [
  { title: 'Asistencia', links: [{ label: 'Centro de ayuda', href: '/info/ayuda' }, { label: 'Información de seguridad', href: '/info/seguridad' }, { label: 'Opciones de cancelación', href: '/info/cancelaciones' }] },
  { title: 'Comunidad', links: [{ label: 'StayHub.org', href: '/info/comunidad' }, { label: 'Programa de referidos', href: '/info/referidos' }, { label: 'Viajeros accesibles', href: '/info/accesibilidad' }] },
  { title: 'Alojamiento', links: [{ label: 'Publicar tu alojamiento', href: '/host/new' }, { label: 'Recursos para anfitriones', href: '/info/anfitriones' }, { label: 'Panel de gestión', href: '/host' }] },
  { title: 'StayHub', links: [{ label: 'Sala de prensa', href: '/info/prensa' }, { label: 'Blog de viajes', href: '/info/blog' }, { label: 'Trabaja con nosotros', href: '/info/empleo' }] },
];
export const legalLinks = [{ label: 'Privacidad', href: '/info/privacidad' }, { label: 'Condiciones', href: '/info/condiciones' }, { label: 'Empresa', href: '/info/empresa' }];
