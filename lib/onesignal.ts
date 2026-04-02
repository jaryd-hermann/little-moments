/**
 * Metro prefers `onesignal.web.ts` / `onesignal.native.ts` at bundle time.
 * This file satisfies TypeScript and ESLint for `import "@/lib/onesignal"`.
 */
export { initOneSignal, syncOneSignalUser } from "./onesignal.native";
