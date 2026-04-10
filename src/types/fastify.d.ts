import type { MemberProfile } from "../domain/types.js";

declare module "fastify" {
  interface FastifyRequest {
    currentAdmin?: MemberProfile;
  }
}
