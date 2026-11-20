import { Link, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { informationPages } from '../data/information';

export function Information() {
  const { topic = '' } = useParams();
  const page = Object.prototype.hasOwnProperty.call(informationPages, topic) ? informationPages[topic] : undefined;
  return <div className="min-h-screen bg-white flex flex-col"><Header /><main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12">
    {page ? <><h1 className="text-3xl font-bold text-gray-900 mb-4">{page.title}</h1><p className="text-gray-700 leading-relaxed">{page.description}</p>
      {page.links && <ul className="mt-6 space-y-3">{page.links.map(link => <li key={link.href}><Link className="text-primary underline" to={link.href}>{link.label}</Link></li>)}</ul>}</>
      : <><h1 className="text-3xl font-bold">Página no encontrada</h1><p className="mt-4">No encontramos esta información.</p></>}
    <Link to="/" className="inline-block mt-8 text-primary underline">Volver al inicio</Link>
  </main></div>;
}
