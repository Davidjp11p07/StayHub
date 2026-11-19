import { observeDependency } from "../observability/otel";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../persistence/generated/client";
import type { SearchIndexPort } from "@search/application/ports/search-index.port";
import type { SearchQuery } from "@search/domain/search-query";
import type {
  SearchSuggestion,
  SuggestionQuery,
  SuggestionType,
} from "@search/domain/suggestion";
import {
  createSearchPage,
  type SearchPage,
  type SearchResult,
} from "@search/domain/search-result";
import { PrismaService } from "../persistence/prisma/prisma.service";
import type { BookingsAvailabilityClient } from "./bookings-availability.client";
import { SearchApplicationError } from "@search/application/errors/search-errors";

interface SearchRow {
  accommodationId: string;
  name: string;
  location: string;
  minNightlyPrice: Prisma.Decimal;
  currency: string;
  capacity: number;
  amenities: string[];
  primaryPhotoUrl: string | null;
  relevance: number;
  total: bigint;
}

interface SuggestionRow {
  text: string;
  type: SuggestionType;
  score: number;
}
@Injectable()
export class PostgreSqlSearchIndexAdapter implements SearchIndexPort {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy?: Pick<BookingsAvailabilityClient, "available">,
  ) {}
  public async health(): Promise<boolean> {
    return this.prisma.isHealthy();
  }
  public async cacheGeneration(): Promise<bigint> {
    const state = await observeDependency("postgresql", "cache-generation", () => this.prisma.searchIndexState.findUnique({
      where: { id: 1 },
    }));
    return state?.cacheGeneration ?? 0n;
  }
  public async search(query: SearchQuery): Promise<SearchPage> {
    const conditions: Prisma.Sql[] = [Prisma.sql`d."published" = TRUE`];
    if (query.countryCode) conditions.push(Prisma.sql`d."countryCode" = ${query.countryCode}`);
    if (query.location)
      conditions.push(
        Prisma.sql`(translate(d."city", 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU') ILIKE translate(${`%${query.location}%`}, 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU') OR translate(d."region", 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU') ILIKE translate(${`%${query.location}%`}, 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU') OR d."countryCode" ILIKE ${query.location})`,
      );
    if (query.amenities.length > 0)
      conditions.push(Prisma.sql`d."amenities" @> ${query.amenities}::text[]`);
    const rank = query.q
      ? Prisma.sql`ts_rank_cd(d."searchVector", websearch_to_tsquery('simple', ${query.q}))`
      : Prisma.sql`0.0`;
    if (query.q)
      conditions.push(
        Prisma.sql`d."searchVector" @@ websearch_to_tsquery('simple', ${query.q})`,
      );
    const offset = (query.page - 1) * query.pageSize;
    const roomFilters = [Prisma.sql`r.capacity >= ${query.guests ?? 1}`];
    if (query.currency) roomFilters.push(Prisma.sql`r.currency = ${query.currency}`);
    if (query.minPrice !== undefined) roomFilters.push(Prisma.sql`r.price >= ${query.minPrice}`);
    if (query.maxPrice !== undefined) roomFilters.push(Prisma.sql`r.price <= ${query.maxPrice}`);
    const rooms = Prisma.sql`jsonb_to_recordset(d.rooms) AS r("roomId" uuid, capacity integer, price numeric, currency text)`;
    const catalogWhere = Prisma.join(conditions, " AND ");
    let legacyDates = Prisma.empty;
    let availableRooms = Prisma.empty;
    if (query.checkIn && query.checkOut) {
      const candidates = await this.prisma.$queryRaw<{ roomId: string }[]>`
        SELECT DISTINCT r."roomId" FROM search_documents d CROSS JOIN LATERAL ${rooms}
        WHERE ${catalogWhere} AND ${Prisma.join(roomFilters, " AND ")}`;
      let available: string[] = [];
      if (candidates.length) {
        if (!this.occupancy) throw new SearchApplicationError("SEARCH_DEPENDENCY_UNAVAILABLE", "Bookings availability is unavailable.", 503);
        available = await this.occupancy.available(candidates.map(row => row.roomId), query.checkIn, query.checkOut);
      }
      availableRooms = Prisma.sql`AND (r."roomId" IS NULL OR r."roomId" = ANY(${available}::uuid[]))`;
      legacyDates = Prisma.sql`AND EXISTS (SELECT 1 FROM availability_windows w
        WHERE w."accommodationId" = d."accommodationId" AND w."startDate" <= ${query.checkIn}::date
        AND w."endDate" >= ${query.checkOut}::date AND w."availableCapacity" >= ${query.guests ?? 1})`;
    }
    // Older snapshots carry only property-level pricing and, optionally, explicit windows.
    const matching = Prisma.sql`FROM search_documents d CROSS JOIN LATERAL (
      SELECT r.price, r.currency, r.capacity FROM (
        SELECT * FROM ${rooms}
        UNION ALL SELECT NULL::uuid, d.capacity, d."minNightlyPrice", d.currency
        WHERE d.rooms IS NULL ${legacyDates}
      ) AS r("roomId", capacity, price, currency)
      WHERE ${Prisma.join(roomFilters, " AND ")} ${availableRooms}
      ORDER BY (r.currency = d.currency) DESC, r.currency, r.price, r.capacity DESC, r."roomId"
      LIMIT 1
    ) offer WHERE ${catalogWhere}`;
    const rows = await observeDependency("postgresql", "search", () => this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT d."accommodationId", d."name", concat_ws(', ', d."city", d."region", d."countryCode") AS "location",
        offer.price AS "minNightlyPrice", offer.currency, offer.capacity, d."amenities", d."primaryPhotoUrl", ${rank}::float8 AS relevance, count(*) OVER() AS total
      ${matching}
      ORDER BY relevance DESC, d."accommodationId" ASC LIMIT ${query.pageSize} OFFSET ${offset}`));
    const items: SearchResult[] = rows.map((row) => ({
      accommodationId: row.accommodationId,
      name: row.name,
      location: row.location,
      minNightlyPrice: Number(row.minNightlyPrice),
      currency: row.currency,
      capacity: row.capacity,
      amenities: row.amenities,
      primaryPhotoUrl: row.primaryPhotoUrl,
      relevance: Number(row.relevance),
    }));
    // Window counts are absent when OFFSET skips every row. Preserve the true total
    // for out-of-range pages instead of reporting that the catalog is empty.
    const total = rows[0]?.total ?? (offset > 0
      ? (await observeDependency("postgresql", "search-count", () => this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
          SELECT count(*) AS total ${matching}`)))[0]?.total ?? 0n
      : 0n);
    return createSearchPage(
      items,
      query.page,
      query.pageSize,
      Number(total),
      Boolean(query.checkIn),
    );
  }

  public async suggest(
    query: SuggestionQuery,
    similarityThreshold: number,
  ): Promise<readonly SearchSuggestion[]> {
    const rows = await observeDependency("postgresql", "suggest", () =>
      this.prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
        WITH candidates AS (
          SELECT d."name" AS text, 'PROPERTY'::text AS type,
            similarity(d."name", ${query.q})::float8 AS score
          FROM "search_documents" d
          WHERE d."published" = TRUE
            AND similarity(d."name", ${query.q}) >= ${similarityThreshold}
          UNION ALL
          SELECT d."city" AS text, 'LOCATION'::text AS type,
            similarity(d."city", ${query.q})::float8 AS score
          FROM "search_documents" d
          WHERE d."published" = TRUE
            AND similarity(d."city", ${query.q}) >= ${similarityThreshold}
        ), deduplicated AS (
          SELECT min(text COLLATE "C") AS text, type, max(score)::float8 AS score
          FROM candidates
          GROUP BY lower(btrim(text)), type
        )
        SELECT text, type, score
        FROM deduplicated
        ORDER BY score DESC, lower(text) COLLATE "C" ASC, type ASC,
          text COLLATE "C" ASC
        LIMIT ${query.limit}
      `),
    );
    return rows.map((row) =>
      Object.freeze({
        text: row.text,
        type: row.type,
        score: Number(row.score),
      }),
    );
  }
}
