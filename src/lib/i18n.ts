export const defaultLocale = "en-US";
import { PRODUCT_NAME } from "./product";
export const messages = { en: { appName: PRODUCT_NAME, back: "Back", signIn: "Sign in", signOut: "Sign out", events: "Events", newEvent: "New event", create: "Create", save: "Save", delete: "Delete" } } as const;
export type Locale = keyof typeof messages;
export function t(key: keyof typeof messages.en, locale: Locale = "en") { return messages[locale][key]; }
