/*
 * porkysbackyardevents.com is retired: the calendar now lives on the main
 * site at porkysbackyard.com/events/ (moved 2026-11-11). Send every request
 * on the old domain there with a 301 so links, QR codes and Google carry over.
 *
 * The *.pages.dev hostname is left alone so this build can still be previewed.
 */

const RETIRED_HOSTS = new Set(["porkysbackyardevents.com", "www.porkysbackyardevents.com"]);
const NEW_HOME = "https://porkysbackyard.com/events/";

export const onRequest: PagesFunction = async ({ request, next }) => {
  const host = new URL(request.url).hostname;
  if (RETIRED_HOSTS.has(host)) return Response.redirect(NEW_HOME, 301);
  return next();
};
