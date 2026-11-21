import { Link } from 'react-router-dom';
import { paths } from '../app/navigation';
import { Header } from '../components/Header';
import { useFavorites } from '../components/property/favorites';

export function Favorites() {
  const { favorites, toggle } = useFavorites();
  return <><Header /><main className="workspace"><p className="kicker">Alojamientos guardados en este navegador</p><h1>Mis favoritos</h1>
    <section className="surface">{favorites.length ? <ul>{favorites.map(item => <li key={item.id} className="arrival-row">
      <div><Link className="font-semibold underline" to={paths.property(item.id)}>{item.title}</Link><p>{item.location}</p></div>
      <button onClick={() => toggle(item)} aria-label={'Quitar de favoritos: ' + item.title}>Quitar</button>
    </li>)}</ul> : <p>Guarda un alojamiento con el corazón para encontrarlo aquí.</p>}</section>
    <Link className="manage-link" to={paths.search}>Explorar alojamientos</Link></main></>;
}
