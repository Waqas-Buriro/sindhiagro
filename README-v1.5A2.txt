HARI DOST v1.5A2 — Map + Field Color Fix

Important live-site observation:
The live page was still showing "Hari Dost v1.4 Full Engineering Build".
That means old files/cache were still being served or the new files were not extracted into the exact subdomain root.

Fixes in this package:
- .htaccess added: DirectoryIndex index.php and no-cache headers for testing.
- CSS hard override added for map height.
- JS/CSS version changed to v1.5A2.
- Map overlay colors are now driven by current weather risk:
  * ٻنيءَ جي حالت = overall weather risk
  * گرمي جو اثر = temperature-driven color risk
  * آلاڻ / پاڻي = humidity/rain-driven color risk
- Grid remains a testing overlay until satellite/field-boundary phase.
- PWA remains excluded.

Upload:
1. Delete/replace old files in agri.sindhilanguage.org root.
2. Extract this ZIP directly inside the subdomain root.
3. Confirm footer says: Hari Dost v1.5A2 Live Weather + Smart Field Color Testing.
4. Hard refresh mobile/browser.
