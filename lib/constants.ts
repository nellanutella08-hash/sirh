// Shared between the (edge) proxy and server-only session helpers, so it
// must not import "server-only" or next/headers.
export const SESSION_COOKIE_NAME_PROXY = "sirh_session";
