import { useParams, Link } from 'react-router-dom';
import { useBooking } from '../api/bookings';
import { Header } from '../components/Header';
import { BookingRow } from './MyBookings';
export function StayDetail(){
 const { id }=useParams();
 const query=useBooking(id);
 return <><Header/><main className="workspace"><h1>Detalle de la reserva</h1>{query.data ? <ul className="surface"><BookingRow booking={query.data}/></ul> : <p role="status">{query.isError?'No se pudo abrir esta reserva.':'Cargando reserva…'}</p>}<Link to="/profile">Mi perfil</Link></main></>;
}
