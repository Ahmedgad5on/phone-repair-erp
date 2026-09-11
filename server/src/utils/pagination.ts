import db from '../db/database';

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function paginateQuery<T = any>(
  baseSql: string,
  params: any[] = [],
  page: number = 1,
  pageSize: number = 20
): PaginatedResult<T> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  const offset = (safePage - 1) * safePageSize;

  // Count total rows using subquery
  const countSql = `SELECT COUNT(*) as total FROM (${baseSql})`;
  const totalRow = db.prepare(countSql).get(...params) as { total: number };
  const totalItems = totalRow?.total || 0;
  const totalPages = Math.ceil(totalItems / safePageSize) || 1;

  // Fetch paginated slice
  const paginatedSql = `${baseSql} LIMIT ? OFFSET ?`;
  const data = db.prepare(paginatedSql).all(...params, safePageSize, offset) as T[];

  return {
    data,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1
    }
  };
}
