import { useHashLocation } from "wouter/use-hash-location";

/** Electron loads the UI via file:// — browser pathname is the .html path, not app routes. */
export const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";

export const appLocationHook = isFileProtocol ? useHashLocation : undefined;
