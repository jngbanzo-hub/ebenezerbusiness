import { createLogisticsGetHandler } from "./logistics-get-handler";
import { serverLogisticsEventSource } from "./server-logistics-event-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createLogisticsGetHandler(serverLogisticsEventSource);
