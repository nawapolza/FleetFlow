# FleetFlow short-link update

Share the clean website URL: https://fleetflow-1-ajlc.onrender.com/

Facebook and other apps can append their own click-tracking query parameters, such as `fbclid`, when a link is opened. No website can prevent Facebook from appending them before navigation. This update removes known tracking parameters from the *visible address bar on page load* with `history.replaceState` (without refreshing the page).

The admin page remains at `/adminnakub`; the script preserves every path, hash, and non-tracking query parameter. It does not redirect admin users to the homepage or change backend login behavior.

## Deploy

Upload this entire `FleetFlow` folder to the existing GitHub repository, build and deploy the Render frontend Static Site, with Root Directory `frontend`, Build Command `npm ci --include=dev --no-audit --no-fund && npm run build`, Publish Directory `dist`, and a single rewrite rule `/*` -> `/index.html` (Rewrite). Backend does not need any change for this update.

Please share the clean link above rather than copying a URL from Facebook's in-app browser. If someone clicks it within Facebook, `fbclid` may appear briefly while the webpage loads; it will disappear after the cleanup script runs.
