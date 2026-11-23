HARI DOST v1.5A — Production Testing Build
===========================================

What changed:
- PWA files removed for the current testing phase.
- Manifest link removed from index.php.
- Map height fixed: no more overly long map.
- Real Open-Meteo weather added through api/weather.php.
- Reverse geocoding added through api/geocode.php.
- 10-minute weather cache and 24-hour geocode cache added in /cache.
- Dynamic Hero Card added.
- Real 7-day forecast cards added.
- Sindhi farmer-language weather interpretation added.
- Daily folk wisdom rotation added.
- Existing GPS, Leaflet map, grid overlay, RTL layout and AMBILE fonts preserved.

Upload instructions:
1. Backup the current agri.sindhilanguage.org files.
2. Upload all files from this ZIP to the subdomain root.
3. Make sure /cache folder exists and is writable.
4. Open the site.
5. Allow GPS permission.
6. Hard refresh browser if old CSS/JS appears.

Important:
- No PWA / service worker / manifest included in this build.
- Satellite layer is still a demo grid for testing.
- v1.5B should add field boundary drawing and acre calculation.
