HARI DOST v1.5A3 — Map Stable + Weather Risk Overlay

This package fixes the map problem more aggressively:
- Leaflet map height is forced to compact fixed ranges.
- Map invalidates/resizes after load, after font/CSS load, and on resize.
- Grid overlay is smaller: 5x5 sample field instead of a large stretched grid.
- Map auto-focuses on the sample overlay so it does not look distorted.
- Leaflet controls remain LTR internally, but popup/control text is RTL Sindhi.
- Footer/version changed to v1.5A3.
- PWA is still excluded.

Important truth:
The colored field overlay is not real crop/field condition yet.
At v1.5A stage it is a weather-driven testing overlay:
- ٻنيءَ جي حالت = overall weather risk
- گرمي جو اثر = heat risk
- آلاڻ / پاڻي = humidity/rain risk

Real field colors need:
v1.5B Field Boundary + v1.5C Satellite Layer.
