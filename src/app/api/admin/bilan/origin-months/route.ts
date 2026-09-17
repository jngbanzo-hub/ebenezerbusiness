import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readBilanOriginMonths, createBilanOriginMonth, updateBilanOriginMonth } from "@/server/bilan-origin-months";
import { createOriginMonthHandlers } from "@/features/admin/bilan/origin-month-handlers";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const { GET, POST, PATCH } = createOriginMonthHandlers({ authorize: authorizeAdminRequest, read: readBilanOriginMonths, create: createBilanOriginMonth, update: updateBilanOriginMonth });
