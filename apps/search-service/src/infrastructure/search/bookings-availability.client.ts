import { readFileSync } from "node:fs";
import { importPKCS8, SignJWT } from "jose";
import { SearchApplicationError } from "@search/application/errors/search-errors";

export class BookingsAvailabilityClient {
  private readonly signingKey = process.env.SEARCH_AVAILABILITY_PRIVATE_KEY_FILE
    ? readFileSync(process.env.SEARCH_AVAILABILITY_PRIVATE_KEY_FILE, "utf8") : undefined;

  constructor(private readonly timeoutMs: number) {}

  async available(roomIds: string[], checkIn: string, checkOut: string): Promise<string[]> {
    try {
      if (!this.signingKey || !process.env.SEARCH_BOOKINGS_BASE_URL) throw new Error();
      const endpoint = new URL("/internal/v1/bookings/availability", process.env.SEARCH_BOOKINGS_BASE_URL);
      const token = await new SignJWT({ scope: "availability:read" })
        .setProtectedHeader({ alg: "RS256", kid: "search-availability-v1" })
        .setIssuer("stayhub-search-service").setAudience("stayhub-bookings-availability")
        .setSubject("search-service").setIssuedAt().setExpirationTime("60s")
        .sign(await importPKCS8(this.signingKey, "RS256"));
      const signal = AbortSignal.timeout(this.timeoutMs);
      const available: string[] = [];
      for (let start = 0; start < roomIds.length; start += 256) {
        const batch = roomIds.slice(start, start + 256);
        const response = await fetch(endpoint, {
          method: "POST", redirect: "error", signal,
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ checkIn, checkOut, roomIds: batch }),
        });
        if (!response.ok) throw new Error();
        const result = await response.json() as { availableRoomIds?: unknown };
        const ids = result.availableRoomIds;
        if (!Array.isArray(ids) || !ids.every((id: unknown): id is string => typeof id === "string" && batch.includes(id))) throw new Error();
        available.push(...ids);
      }
      return available;
    } catch {
      throw new SearchApplicationError("SEARCH_DEPENDENCY_UNAVAILABLE", "Bookings availability is unavailable.", 503);
    }
  }
}
