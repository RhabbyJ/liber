import { createLoiNegotiationSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { loiErrorResponse, parseLoiJson, privateLoiJson } from "../../../../server/loi/http";
import { createLoiNegotiation } from "../../../../server/loi/service";
import { isRequestSameOrigin } from "../../../../server/request-origin";

export async function POST(request: NextRequest) {
  if (!isRequestSameOrigin(request)) return privateLoiJson({ error: "Invalid origin." }, 403);
  try {
    return privateLoiJson(await createLoiNegotiation(await parseLoiJson(request, createLoiNegotiationSchema)), 201);
  } catch (error) {
    return loiErrorResponse(error);
  }
}

