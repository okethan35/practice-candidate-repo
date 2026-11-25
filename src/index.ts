import { createApp } from "./server";

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`staffing-lite listening on http://localhost:${port}`);
});
