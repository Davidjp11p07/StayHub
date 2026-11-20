import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  latitude: string;
  longitude: string;
  disabled: boolean;
  onSelect: (latitude: string, longitude: string) => void;
}

export function CoordinatePicker({ latitude, longitude, disabled, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const marker = useRef<L.Marker>();
  const icon = useRef<L.DivIcon>();
  const onClick = useRef(onSelect);
  useEffect(() => { onClick.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!container.current) return;
    const view = L.map(container.current, { minZoom: 1, maxZoom: 19 }).setView([0, 0], 1);
    map.current = view;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(view);
    icon.current = L.divIcon({
      className: 'rounded-full border-2 border-white bg-blue-700 shadow',
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    return () => { view.remove(); map.current = undefined; marker.current = undefined; };
  }, []);

  useEffect(() => {
    const view = map.current;
    if (!view || disabled) return;
    const select = (event: L.LeafletMouseEvent) => {
      const point = event.latlng.wrap();
      onClick.current(point.lat.toFixed(6), point.lng.toFixed(6));
    };
    view.on('click', select);
    return () => { view.off('click', select); };
  }, [disabled]);

  useEffect(() => {
    const view = map.current;
    if (!view) return;
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      marker.current?.remove();
      marker.current = undefined;
      return;
    }
    const point = L.latLng(lat, lon);
    if (marker.current) marker.current.setLatLng(point);
    else marker.current = L.marker(point, { icon: icon.current, title: 'Ubicación seleccionada', keyboard: false }).addTo(view);
    if (!view.getBounds().contains(point) || view.getZoom() < 5) view.setView(point, Math.max(view.getZoom(), 12));
  }, [latitude, longitude]);

  return <div>
    <p className="mb-2 text-sm text-gray-700">Selecciona un punto en el mapa o escribe la latitud y la longitud en los campos anteriores.</p>
    <div ref={container} role="region" aria-label="Mapa para seleccionar coordenadas" className="relative z-0 h-72 w-full rounded-xl border" />
  </div>;
}
