import { StayConversation } from './StayConversation';
import { useParams, Link } from 'react-router-dom';
import { useBooking } from '../api/bookings';
import { Header } from '../components/Header';
import { BookingRow } from './MyBookings';
export function StayDetail(){
 const { id }=useParams();
 const query=useBooking(id);
 return <><Header/><main className="workspace"><h1>Detalle de la reserva</h1>{query.data ? <ul className="surface"><BookingRow booking={query.data}><p>Referencia · {query.data.id}</p><button type="button" className="manage-link mr-4" onClick={()=>window.print()}>Imprimir comprobante</button><Link className="manage-link" to="/info/ayuda">Centro de ayuda</Link></BookingRow></ul> : <p role="status">{query.isError?'No se pudo abrir esta reserva.':'Cargando reserva…'}</p>}{query.data && <StayConversation key={query.data.id} id={query.data.id}/>}<Link to="/profile">Mi perfil</Link></main></>;
}
