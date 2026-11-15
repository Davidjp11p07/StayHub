/**
 * Classifies a non-200 answer of the Accommodations inventory-context contract.
 * - 404: room missing or hidden (indistinguishable by contract) -> ROOM_NOT_FOUND for the caller.
 * - 400/401/403: our request or credentials do not match the contract; the caller did nothing wrong.
 * - 5xx and anything else: dependency failure.
 * Everything except 404 surfaces as 503 DEPENDENCY_UNAVAILABLE; the upstream Problem body is never forwarded.
 */
export type AccommodationsOutcome = 'not_found' | 'unavailable';

export function classifyAccommodationsStatus(status: number): AccommodationsOutcome {
  return status === 404 ? 'not_found' : 'unavailable';
}
