import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { http } from '../api/http';
import { useAuth } from '../context/AuthContext';

interface Message { id:string; role:string; body:string; sentAt:string }
export function StayConversation({id}:{id:string}) {
  const {currentUser}=useAuth();
  const url='/bookings/'+id+'/messages';
  const thread=useQuery({queryKey:['stay-messages',currentUser?.id,id],queryFn:async({signal})=>(await http.get<Message[]>(url,{signal})).data,refetchInterval:15000});
  const [text,setText]=useState('');
  const [key,setKey]=useState(()=>crypto.randomUUID());
  const [sending,setSending]=useState(false);
  const [error,setError]=useState(false);
  return <section className="surface"><h2>{currentUser?.role==='OWNER'?'Conversación con el huésped':'Contactar al anfitrión'}</h2>
    {thread.isError?<p role="alert">No se pudo cargar la conversación. <button onClick={()=>void thread.refetch()}>Reintentar</button></p>:
      thread.isPending?<p>Cargando mensajes…</p>:thread.data.length===0?<p>Todavía no hay mensajes para esta reserva.</p>:
      <ol>{thread.data.map(m=><li key={m.id} className="my-3"><strong>{m.role===currentUser?.role?'Tú':m.role==='OWNER'?'Anfitrión':'Huésped'}</strong> · <time dateTime={m.sentAt}>{new Date(m.sentAt).toLocaleString('es-CO')}</time><p className="whitespace-pre-wrap break-words">{m.body}</p></li>)}</ol>}
    <form onSubmit={async e=>{
      e.preventDefault();if(sending || !text.trim())return;
      setSending(true);setError(false);
      try {await http.post(url,{id:key,body:text.trim()});setText('');setKey(crypto.randomUUID());await thread.refetch();}
      catch {setError(true);}finally{setSending(false);}
    }}><label>Mensaje<textarea required maxLength={2000} disabled={sending} value={text} onChange={e=>{setText(e.target.value);setKey(crypto.randomUUID());}} /></label>
    <button className="action-primary" disabled={sending || !text.trim()}>Enviar mensaje</button>
    {error && <p role="alert">No se pudo confirmar el envío. Vuelve a intentarlo.</p>}</form></section>;
}
