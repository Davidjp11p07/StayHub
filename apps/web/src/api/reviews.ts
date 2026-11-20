import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from './http';
import { ApiError } from './identity';
import { isPropertyId, propertyKeys } from './properties';
import type { Booking, Review, ReviewPage } from '../types/catalog';

/** Public property reviews and guest review history through the gateway. */
export const reviewKeys = {
  all: ['reviews'] as const,
  property: (propertyId: string, page: number, pageSize: number) => [...reviewKeys.all, 'property', propertyId, page, pageSize] as const,
  user: (userId: string, page: number, pageSize: number) => [...reviewKeys.all, 'user', userId, page, pageSize] as const,
};

export async function getPropertyReviews(
  propertyId: string, { page = 1, pageSize = 5 }: { page?: number; pageSize?: number } = {}, signal?: AbortSignal,
): Promise<ReviewPage> {
  if (!isPropertyId(propertyId)) throw new ApiError(404, { code: 'NOT_FOUND' });
  const { data } = await http.get<UserReviewsPage & Partial<ReviewPage>>(`/properties/${propertyId}/reviews`, { params: { page, pageSize }, signal });
  const complete = data.items.length > 0 && data.items.length === data.total;
  const averageRating = data.averageRating ?? (complete
    ? data.items.reduce((sum, review) => sum + review.rating, 0) / data.total : null);
  return { ...data, averageRating, hasNext: data.hasNext ?? data.page < data.totalPages };
}

export function usePropertyReviews(propertyId: string | undefined, page = 1, pageSize = 5) {
  return useQuery({
    queryKey: reviewKeys.property(propertyId ?? '', page, pageSize),
    queryFn: ({ signal }) => getPropertyReviews(propertyId ?? '', { page, pageSize }, signal),
    enabled: isPropertyId(propertyId),
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Write (RQ-11)
// ---------------------------------------------------------------------------

export interface CreateReviewInput { bookingId: string; rating: number; comment: string }

/** Review as returned by the contract (`POST /reviews`): no author fields. */
export interface WrittenReview { id: string; propertyId: string; rating: number; comment: string; createdAt: string }

export interface UserReviewsPage { items: Review[]; page: number; pageSize: number; total: number; totalPages: number }

/** A stay can be reviewed only once it is COMPLETED (Bookings is the authority; this only gates the UI). */
export function isReviewable(booking: Pick<Booking, 'status'>): boolean {
  return booking.status === 'COMPLETED';
}

export async function createReview(input: CreateReviewInput, signal?: AbortSignal): Promise<WrittenReview> {
  const { data } = await http.post<WrittenReview>('/reviews', {
    bookingId: input.bookingId, rating: input.rating, comment: input.comment.trim(),
  }, { signal });
  return data;
}

export function useCreateReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReviewInput) => createReview(input),
    onSuccess: (written) => {
      // Refresh the user's reviews, the property's reviews and its detail (average/count) — FE-038.
      void client.invalidateQueries({ queryKey: reviewKeys.all });
      void client.invalidateQueries({ queryKey: propertyKeys.detail(written.propertyId) });
    },
  });
}

export async function getUserReviews(
  userId: string, { page = 1, pageSize = 20 }: { page?: number; pageSize?: number } = {}, signal?: AbortSignal,
): Promise<UserReviewsPage> {
  const { data } = await http.get<UserReviewsPage>(`/reviews/user/${userId}`, { params: { page, pageSize }, signal });
  return data;
}

export function useUserReviews(userId: string | undefined, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: reviewKeys.user(userId ?? '', page, pageSize),
    queryFn: ({ signal }) => getUserReviews(userId ?? '', { page, pageSize }, signal),
    enabled: userId !== undefined,
  });
}

/** Safe copy for a review write/read failure, keyed by HTTP status. */
export function reviewWriteErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No pudimos publicar tu reseña. Intenta nuevamente.';
  switch (error.status) {
    case 400: return 'Revisa la calificación y el comentario.';
    case 401: return 'Tu sesión venció. Inicia sesión nuevamente.';
    case 403: return 'Solo puedes reseñar una estadía completada que hayas realizado.';
    case 404: return 'No encontramos la reserva.';
    case 409: return 'Ya dejaste una reseña para esta reserva.';
    default: return 'No pudimos publicar tu reseña. Intenta nuevamente.';
  }
}
