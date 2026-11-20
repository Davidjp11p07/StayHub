import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { http } from '../api/http';

interface Notice { id: string; subject: string; body: string; readAt: string | null }
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
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-sm font-semibold text-primary underline">Notificaciones</button>
    {open && <section aria-label="Notificaciones" className="my-3 rounded-xl border p-4">
      {inbox.isPending && <p role="status">Cargando avisos…</p>}
      {inbox.isError && <button onClick={() => void inbox.refetch()}>Reintentar la consulta de avisos</button>}
      {inbox.data?.pages[0]?.items.length === 0 && <p>Aún no tienes avisos.</p>}
      {inbox.data?.pages.map(page => page.items.map(item => <article key={item.id} className="border-b py-3">
        <h3 className="font-semibold">{item.subject}</h3><p>{item.body}</p>
        {item.readAt ? <span>Leída</span> : <button disabled={read.isPending} onClick={() => read.mutate(item.id)} className="text-primary underline">Marcar como leída</button>}
      </article>))}
      {read.isError && <p role="alert">No se pudo marcar el aviso como leído.</p>}
      {inbox.hasNextPage && <button disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>Ver más avisos</button>}
    </section>}
  </div>;
}
