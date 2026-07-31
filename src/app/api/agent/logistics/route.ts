import { createLogisticsGetHandler } from "./logistics-get-handler";
import { localLogisticsEventSource } from "./local-logistics-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createLogisticsGetHandler(localLogisticsEventSource);
