import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { http } from '../api/http';
import { Header } from '../components/Header';
import type { Property } from '../types/catalog';

interface Decision {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  version: number;
  reason: string | null;
}
interface QueueItem { propertyId: string; version: number; property: { name: string } }

function useVerification(id: string) {
  return useQuery({
    queryKey: ['verification', id],
    queryFn: async () => (await http.get<{ property: Property; history: Decision[] }>(`/properties/${id}/verification`)).data,
  });
}

export function OwnerVerification({ property }: { property: Property }) {
  const detail = useVerification(property.id);
  const latest = detail.data?.history[0];
  const submit = useMutation({
    mutationFn: () => http.post(`/properties/${property.id}/verification`, { version: property.version }),
    onSuccess: () => detail.refetch(),
  });
  return <section className="my-4 rounded-xl border p-4">
    <h2 className="font-semibold">Revisión del inmueble</h2>
    {detail.isLoading && <p>Cargando revisión…</p>}
    {latest && <p>{({ PENDING: 'Pendiente de revisión', REJECTED: 'Rechazada', APPROVED: 'Aprobada' })[latest.status]} · versión {latest.version}</p>}
    {latest?.reason && <p>{latest.reason}</p>}
    {detail.data && property.status !== 'PUBLISHED' && latest?.version !== property.version &&
      <button className="mt-2 underline" disabled={submit.isPending} onClick={() => submit.mutate()}>Solicitar revisión</button>}
    {(detail.isError || submit.isError) && <p role="alert">No se pudo completar la consulta o solicitud de revisión.</p>}
  </section>;
}

function EvidencePhoto({ path, position }: { path: string; position: number }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void http.get<Blob>(path, { responseType: 'blob', signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  if (failed) return <p role="alert">No se pudo cargar la foto {position}.</p>;
  return url ? <img src={url} alt={`Foto ${position} del inmueble`} className="max-h-80 rounded object-contain" /> : <p>Cargando foto {position}...</p>;
}

function ReviewDetail({ row, onDone }: { row: QueueItem; onDone: () => void }) {
  const detail = useVerification(row.propertyId);
  const [reason, setReason] = useState('');
  const decide = useMutation({
    mutationFn: (status: 'APPROVED' | 'REJECTED') => http.post(`/properties/${row.propertyId}/verification/decision`, { version: row.version, status, reason }),
    onSuccess: onDone,
  });
  const property = detail.data?.property;
  if (!property) return <p role="status">{detail.isError ? 'No se pudo cargar el inmueble.' : 'Cargando inmueble…'}</p>;
  return <section className="rounded-xl border p-5 space-y-3">
    <h2 className="text-xl font-semibold">{property.name}</h2>
    <p>{property.location.addressLine}, {property.location.city}, {property.location.country}</p>
    <p>{property.description}</p>
    {property.rooms.map(room => <p key={room.id}>{room.name} · {room.capacity} huéspedes · {room.basePrice?.amount} {room.basePrice?.currency}</p>)}
    <div className="grid gap-3 sm:grid-cols-2">{property.photos.map((photo, index) =>
      <EvidencePhoto key={photo.id} path={`/properties/${property.id}/photos/${photo.id}`} position={index + 1} />)}</div>
    <label className="block">Motivo de la decisión<textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded border p-2" /></label>
    <div className="flex gap-4">{(['APPROVED', 'REJECTED'] as const).map(status =>
      <button key={status} className="rounded border px-4 py-2" disabled={!reason.trim() || decide.isPending}
        onClick={() => decide.mutate(status)}>{status === 'APPROVED' ? 'Aprobar y publicar' : 'Rechazar'}</button>)}</div>
    {decide.isError && <p role="alert">No se pudo registrar la decisión. Actualiza la lista antes de reintentar.</p>}
  </section>;
}

export function PropertyVerification() {
  const queue = useQuery({ queryKey: ['verification-queue'], queryFn: async () => (await http.get<QueueItem[]>('/properties/verification/pending')).data });
  const [selected, setSelected] = useState<QueueItem>();
  return <><Header /><main className="management-content mx-auto max-w-4xl px-6 py-10 space-y-5">
    <h1 className="text-3xl font-bold">Inmuebles pendientes de revisión</h1>
    <button className="underline" onClick={() => { setSelected(undefined); void queue.refetch(); }}>Actualizar lista</button>
    {queue.isLoading && <p>Cargando solicitudes…</p>}
    {queue.isError && <p role="alert">No se pudo consultar la lista.</p>}
    {queue.data?.length === 0 && <p>No hay solicitudes pendientes.</p>}
    <ul>{queue.data?.map(row => <li key={row.propertyId}><button className="py-2 underline" onClick={() => setSelected(row)}>{row.property.name}</button></li>)}</ul>
    {selected && <ReviewDetail key={selected.propertyId} row={selected} onDone={() => { setSelected(undefined); void queue.refetch(); }} />}
  </main></>;
}
