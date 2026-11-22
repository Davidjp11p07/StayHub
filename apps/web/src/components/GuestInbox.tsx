import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { http } from '../api/http';

interface Notice { id: string; subject: string; body: string; createdAt?: string; readAt: string | null }
interface InboxPage { items: Notice[]; nextCursor: string | null }

export function GuestInbox({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const key = ['notifications', userId];
  const inbox = useInfiniteQuery({
    queryKey: key, enabled: open, initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => (await http.get<InboxPage>('/notifications', {
      params: pageParam ? { cursor: pageParam } : {}, signal,
    })).data,
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const read = useMutation({
    mutationFn: (id: string) => http.patch('/notifications/' + id + '/read'),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return <div>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inbox-toggle">Notificaciones</button>
    {open && <section aria-label="Notificaciones" className="surface inbox"><h2>Centro de notificaciones</h2>
      {inbox.isPending && <p role="status">Cargando avisos…</p>}
      {inbox.isError && <button onClick={() => void inbox.refetch()}>Reintentar la consulta de avisos</button>}
      {inbox.data?.pages[0]?.items.length === 0 && <p>Aún no tienes avisos.</p>}
      {inbox.data?.pages.map(page => page.items.map(item => <article key={item.id} className="notice" data-unread={!item.readAt}><div className="notice-meta"><span>{item.readAt ? 'Leída' : 'Sin leer'}</span>{item.createdAt && <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</time>}</div>
        <h3 className="font-semibold">{item.subject}</h3>{/\bReserva ([0-9a-f-]{36})\b/i.test(item.body) && <a className="underline" href={'/stay/'+item.body.match(/\bReserva ([0-9a-f-]{36})\b/i)![1]}>Ver reserva</a>}<p>{item.body}</p>
        {!item.readAt && <button disabled={read.isPending} onClick={() => read.mutate(item.id)} className="text-primary underline">Marcar como leída</button>}
      </article>))}
      {read.isError && <p role="alert">No se pudo marcar el aviso como leído.</p>}
      {inbox.hasNextPage && <button disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>Ver más avisos</button>}
    </section>}
  </div>;
}
