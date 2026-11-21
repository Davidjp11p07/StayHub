import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate, useParams, useRoutes, type RouteObject } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home } from '../pages/Home';
import { Information } from '../pages/Information';
import { Login } from '../pages/Login';
import { MyBookings } from '../pages/MyBookings';
import { MyReviews } from '../pages/MyReviews';
import { Booking } from '../pages/booking/Booking';
import { CancelBooking } from '../pages/booking/CancelBooking';
import { Payment } from '../pages/booking/Payment';
import { ReviewProperty } from '../pages/booking/ReviewProperty';
import { PropertyDetail } from '../pages/PropertyDetail';
import { Register } from '../pages/Register';
import { Search } from '../pages/Search';
import { PropertyVerification } from '../pages/PropertyVerification';
import { Favorites } from '../pages/Favorites';
import { Profile } from '../pages/Profile';
import { Inventory } from '../pages/host/Inventory';
import { EditProperty } from '../pages/host/EditProperty';
import { BookingsReceived } from '../pages/host/BookingsReceived';
import { HostHome } from '../pages/host/HostHome';
import { Reports } from '../pages/host/Reports';
import { MyProperties } from '../pages/host/MyProperties';
import { PublishProperty } from '../pages/host/PublishProperty';
import type { PendingBookingData } from '../types';
import {
  paths, safeReturnPath, useLegacyNavigate,
  type DetailLocationState, type LoginLocationState,
} from './navigation';
import { RequireRole } from './RequireRole';

/** Session gate shared by every route: identity must be resolved before rendering pages. */
function AppLayout() {
  const auth = useAuth();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [pathname]);

  if (auth.status === 'checking') return <p role="status" className="p-8">Comprobando sesión…</p>;
  if (auth.status === 'unavailable') {
    return (
      <div role="alert" className="p-8">
        <p>{auth.error}</p>
        <button onClick={() => { void auth.retrySession(); }}>Reintentar</button>
        <button onClick={() => { void auth.logout(); }}>Cerrar sesión</button>
      </div>
    );
  }
  return <Outlet />;
}

function LoginRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const onNavigate = useLegacyNavigate();
  const state = (location.state ?? {}) as LoginLocationState;
  const onSuccess = () => {
    const target = safeReturnPath(state.from) ?? paths.home;
    const next: DetailLocationState | undefined = state.pendingBooking ? { pendingBooking: state.pendingBooking } : undefined;
    navigate(target, { replace: true, state: next });
  };
  return (
    <Login
      onNavigate={(page) => (page === 'register'
        ? navigate(paths.register, { state: { from: state.from } satisfies LoginLocationState })
        : onNavigate(page))}
      onSuccess={onSuccess}
      initialEmail={state.registeredEmail}
      registered={!!state.registeredEmail}
      notice={state.notice}
    />
  );
}

function RegisterRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const onNavigate = useLegacyNavigate();
  const state = (location.state ?? {}) as LoginLocationState;
  return (
    <Register
      onNavigate={(page) => (page === 'login'
        ? navigate(paths.login, { state: { from: state.from } satisfies LoginLocationState })
        : onNavigate(page))}
      onSuccess={(email) => navigate(paths.login, { state: { registeredEmail: email, from: state.from } satisfies LoginLocationState })}
    />
  );
}

function PropertyDetailRoute() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as DetailLocationState;
  const onBookingRequired = (pendingBooking: PendingBookingData) => {
    navigate(paths.login, { state: { from: location.pathname, pendingBooking } satisfies LoginLocationState });
  };
  // Drop the consumed pending booking so a reload or back navigation does not replay it.
  const onBookingConfirmed = () => navigate(location.pathname, { replace: true, state: null });
  return (
    <PropertyDetail
      key={id}
      propertyId={id}
      pendingBooking={state.pendingBooking ?? null}
      onBookingRequired={onBookingRequired}
      onBookingConfirmed={onBookingConfirmed}
    />
  );
}

function MyBookingsRoute() {
  return <MyBookings onNavigate={useLegacyNavigate()} />;
}

function MyReviewsRoute() {
  return <MyReviews onNavigate={useLegacyNavigate()} />;
}

/**
 * Role-based access map (enforced by `RequireRole`; the Gateway still authorizes every request):
 * - Public: home, search, detail, login, register.
 * - Guest/history: `/bookings` renders for everyone and the page itself prompts anonymous visitors to
 *   sign in; booking flows that require a guest session arrive with Sprint 3.
 * - Owner (OWNER): every `/host/*` route (panel, publish, my properties, edit) is guarded, redirecting
 *   anonymous visitors to login (remembering the destination) and other roles home with a notice.
 * Global 401/403 responses are handled once in `api/queryClient.ts` (session invalidation + a toast).
 */
export const appRoutes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/verification', element: <RequireRole role="VERIFIER" anonymousNotice="Inicia sesión para revisar inmuebles." forbiddenNotice="Esta sección requiere el rol de verificador."><PropertyVerification /></RequireRole> },
      // Public
      { path: paths.home, element: <Home /> },
      { path: '/info/:topic', element: <Information /> },
      { path: paths.login, element: <LoginRoute /> },
      { path: paths.register, element: <RegisterRoute /> },
      { path: paths.search, element: <Search /> },
      { path: '/favorites', element: <Favorites /> },
      { path: '/profile', element: <Profile /> },
      { path: '/property/:id', element: <PropertyDetailRoute /> },
      // Guest (the page itself prompts anonymous visitors to sign in)
      { path: paths.bookings, element: <MyBookingsRoute /> },
      { path: paths.reviews, element: <MyReviewsRoute /> },
      // Authenticated (guest or owner): cancellation step. The page redirects to login on a 401 and
      // the server enforces ownership (403/404), so no single-role guard fits here.
      { path: '/bookings/:bookingId/cancel', element: <CancelBooking /> },
      { path: '/bookings/:bookingId/review', element: <ReviewProperty /> },
      // Authenticated guest: booking flow (RQ-07). Payment screen (`/booking/:id/pay`) arrives in FE-031.
      {
        path: '/property/:id/book',
        element: (
          <RequireRole
            role="GUEST"
            anonymousNotice="Inicia sesión como huésped para completar tu reserva."
            forbiddenNotice="Las reservas son para cuentas de huésped."
          >
            <Booking />
          </RequireRole>
        ),
      },
      {
        path: '/booking/:bookingId/pay',
        element: (
          <RequireRole
            role="GUEST"
            anonymousNotice="Inicia sesión como huésped para completar tu pago."
            forbiddenNotice="Los pagos de reserva son para cuentas de huésped."
          >
            <Payment />
          </RequireRole>
        ),
      },
      // Owner
      { path: '/host/reports', element: <RequireRole role="OWNER"><Reports /></RequireRole> },
      { path: '/admin/reports', element: <RequireRole role="ADMIN"><Reports /></RequireRole> },
      { path: paths.host, element: <RequireRole role="OWNER"><HostHome /></RequireRole> },
      { path: paths.hostBookings, element: <RequireRole role="OWNER"><BookingsReceived /></RequireRole> },
      { path: paths.hostNew, element: <RequireRole role="OWNER"><PublishProperty /></RequireRole> },
      { path: paths.hostProperties, element: <RequireRole role="OWNER"><MyProperties /></RequireRole> },
      { path: '/host/properties/:id/edit', element: <RequireRole role="OWNER"><EditProperty /></RequireRole> },
      { path: '/host/inventory/:roomId', element: <RequireRole role="OWNER"><Inventory /></RequireRole> },
      { path: '*', element: <main className="p-8"><h1>Página no encontrada</h1><p>No encontramos la página solicitada.</p><a href={paths.home}>Volver al inicio</a></main> },
    ],
  },
];

export function AppRoutes() {
  return useRoutes(appRoutes);
}
