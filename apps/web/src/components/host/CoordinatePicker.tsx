import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATALOG_LIMITS } from '../../types/catalog';
import type { MapAddress } from './propertyForm';

interface Props {
  latitude: string;
  longitude: string;
  disabled: boolean;
  onSelect: (latitude: string, longitude: string) => void;
  onAddress: (latitude: string, longitude: string, address: MapAddress) => void;
}

export function CoordinatePicker({ latitude, longitude, disabled, onSelect, onAddress }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const marker = useRef<L.Marker>();
  const icon = useRef<L.DivIcon>();
  const handlers = useRef({ onSelect, onAddress });
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  useEffect(() => { handlers.current = { onSelect, onAddress }; }, [onSelect, onAddress]);

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
    let lookup: AbortController | undefined;
    const select = async (event: L.LeafletMouseEvent) => {
      const point = event.latlng.wrap();
      const lat = point.lat.toFixed(6);
      const lon = point.lng.toFixed(6);
      const { onSelect, onAddress } = handlers.current;
      onSelect(lat, lon);

      lookup?.abort();
      const request = new AbortController();
      lookup = request;
      setMessage('Buscando ciudad y región…');
      const timeout = window.setTimeout(() => request.abort(), 8000);
      try {
        const params = new URLSearchParams({ lat, lon, limit: '1' });
        const endpoint = import.meta.env.DEV ? '/local-geocoding/reverse' : 'https://photon.komoot.io/reverse';
        const response = await fetch(`${endpoint}?${params}`, {
          signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
        });
        if (!response.ok) throw new Error('Reverse geocoding failed');
        const result = await response.json();
        if (lookup !== request) return;
        const place = result.features?.[0]?.properties;
        const country = place?.countrycode;
        const address = {
          city: validField(place?.city, CATALOG_LIMITS.cityMaxLength),
          region: validField(place?.state, CATALOG_LIMITS.regionMaxLength),
          country: typeof country === 'string' && /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : undefined,
          postalCode: validField(place?.postcode, CATALOG_LIMITS.postalCodeMaxLength),
        };
        onAddress(lat, lon, address);
        setMessage(address.city && address.region ? '' : 'Revisa la ciudad y la región. Completa los datos que falten.');
      } catch {
        if (lookup === request) setMessage('No se pudo consultar la ubicación. Puedes completar los campos manualmente.');
      } finally {
        window.clearTimeout(timeout);
      }
    };
    view.on('click', select);
    return () => {
      view.off('click', select);
      lookup?.abort();
      lookup = undefined;
      setMessage('');
    };
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

  function centerOnDevice() {
    const view = map.current;
    if (!view || locating) return;
    if (!navigator.geolocation) {
      setLocationMessage('La ubicación del dispositivo no está disponible en este navegador.');
      return;
    }

    setLocating(true);
    setLocationMessage('Buscando la ubicación del dispositivo…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (map.current !== view) return;
        view.setView([coords.latitude, coords.longitude], 15);
        setLocating(false);
        setLocationMessage('Mapa centrado. Selecciona el punto de tu alojamiento.');
      },
      (error) => {
        if (map.current !== view) return;
        setLocating(false);
        setLocationMessage(error.code === 1
          ? 'Permite el acceso a tu ubicación en el navegador para centrar el mapa.'
          : 'No se pudo obtener tu ubicación. Intenta de nuevo o navega por el mapa.');
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  return <div>
    <p className="mb-2 text-sm text-gray-700">Selecciona un punto en el mapa o escribe la latitud y la longitud en los campos anteriores.</p>
    <button
      type="button"
      onClick={centerOnDevice}
      disabled={locating}
      className="mb-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
    >
      Centrar en mi ubicación
    </button>
    {locationMessage && <p role="status" className="mb-2 text-sm text-gray-700">{locationMessage}</p>}
    <div ref={container} role="region" aria-label="Mapa para seleccionar coordenadas" className="relative z-0 h-72 w-full rounded-xl border" />
    {message && !disabled && <p role="status" className="mt-2 text-sm text-gray-700">{message}</p>}
  </div>;
}

function validField(value: unknown, maxLength: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= maxLength ? text : undefined;
}
