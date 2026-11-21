import { Link, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { informationPages } from '../data/information';

export function Information() {
  const { topic = '' } = useParams();
  const page = Object.prototype.hasOwnProperty.call(informationPages, topic) ? informationPages[topic] : undefined;
  return <div className="min-h-screen bg-slate-50 flex flex-col"><Header /><main className="management-content flex-1 w-full max-w-3xl mx-auto px-6 py-12">
    {page ? <><h1 className="text-3xl font-bold text-gray-900 mb-4">{page.title}</h1>{page.sections.map(section => <section key={section.title} className="mt-7"><h2 className="text-xl font-semibold">{section.title}</h2><p className="mt-2 leading-relaxed text-slate-700">{section.body}</p></section>)}
      {page.links && <ul className="mt-6 space-y-3">{page.links.map(link => <li key={link.href}><Link className="text-primary underline" to={link.href}>{link.label}</Link></li>)}</ul>}</>
      : <><h1 className="text-3xl font-bold">Página no encontrada</h1><p className="mt-4">No encontramos esta información.</p></>}
    <Link to="/" className="inline-block mt-8 text-primary underline">Volver al inicio</Link>
  </main></div>;
}
