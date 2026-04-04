import { loadLocalEnv } from "./config/load-env";
import { createApp } from "./app";

loadLocalEnv();
const port = Number(process.env.PORT ?? 3000);

const app = await createApp();

try {
  await app.listen({
    port,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
