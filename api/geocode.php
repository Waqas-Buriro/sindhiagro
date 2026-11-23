<?php
header('Content-Type: application/json; charset=utf-8');

function hd_out($data) {
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function hd_get($url) {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 10,
      CURLOPT_CONNECTTIMEOUT => 6,
      CURLOPT_USERAGENT => 'HariDost/1.5C1 agri.sindhilanguage.org',
      CURLOPT_SSL_VERIFYPEER => true
    ));
    $res = curl_exec($ch);
    $err = curl_errno($ch);
    curl_close($ch);
    if (!$err && $res) return $res;
  }
  $ctx = stream_context_create(array(
    'http' => array(
      'timeout' => 10,
      'header' => "User-Agent: HariDost/1.5C1 agri.sindhilanguage.org\r\n"
    )
  ));
  return @file_get_contents($url, false, $ctx);
}

function sindhi_place($name) {
  $name = trim((string)$name);
  $map = array(
    'Karachi' => 'ڪراچي', 'Karachi City' => 'ڪراچي', 'Hyderabad' => 'حيدرآباد',
    'Sanghar' => 'سانگهڙ', 'Badin' => 'بدين', 'Khairpur' => 'خيرپور',
    'Tando Muhammad Khan' => 'ٽنڊو محمد خان', 'Tando Allahyar' => 'ٽنڊو الهيار',
    'Umerkot' => 'عمرڪوٽ', 'Mirpur Khas' => 'ميرپورخاص', 'Mirpurkhas' => 'ميرپورخاص',
    'Tharparkar' => 'ٿرپارڪر', 'Mithi' => 'مٺي', 'Sujawal' => 'سجاول',
    'Thatta' => 'ٺٽو', 'Jamshoro' => 'ڄامشورو', 'Dadu' => 'دادو',
    'Shaheed Benazirabad' => 'شھيد بينظيرآباد', 'Nawabshah' => 'نوابشاھ',
    'Naushahro Feroze' => 'نوشهرو فيروز', 'Matiari' => 'مٽياري',
    'Sukkur' => 'سکر', 'Larkana' => 'لاڙڪاڻو', 'Shikarpur' => 'شڪارپور',
    'Jacobabad' => 'جيڪب آباد', 'Kashmore' => 'ڪشمور', 'Ghotki' => 'گهوٽڪي',
    'Qambar Shahdadkot' => 'قمبر شھدادڪوٽ', 'Malir' => 'ملير',
    'Korangi' => 'ڪورنگي', 'Keamari' => 'ڪياماڙي', 'Kemari' => 'ڪياماڙي',
    'Sindh' => 'سنڌ'
  );

  foreach ($map as $k => $v) {
    if (mb_stripos($name, $k) !== false) return $v;
  }
  return $name ?: 'سنڌ';
}

$lat = isset($_GET['lat']) ? floatval($_GET['lat']) : 25.3960;
$lon = isset($_GET['lon']) ? floatval($_GET['lon']) : 68.3578;

$cacheDir = dirname(__DIR__) . '/cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
$key = 'geo_' . round($lat, 2) . '_' . round($lon, 2) . '.json';
$cacheFile = $cacheDir . '/' . preg_replace('/[^a-zA-Z0-9_.-]/', '_', $key);
$ttl = 86400;

if (is_file($cacheFile) && (time() - filemtime($cacheFile) < $ttl)) {
  $cached = @file_get_contents($cacheFile);
  if ($cached) { echo $cached; exit; }
}

$url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' . rawurlencode($lat) . '&lon=' . rawurlencode($lon) . '&zoom=10&addressdetails=1';
$raw = hd_get($url);
if (!$raw) hd_out(array("ok"=>false, "district"=>"سنڌ"));

$j = json_decode($raw, true);
$addr = $j['address'] ?? array();

$rawName = $addr['state_district'] ?? $addr['county'] ?? $addr['city'] ?? $addr['town'] ?? $addr['municipality'] ?? $addr['state'] ?? 'سنڌ';
$district = sindhi_place(str_replace(array('District', ' ضلعو'), '', $rawName));

$talukaRaw = $addr['municipality'] ?? $addr['town'] ?? $addr['city'] ?? $addr['city_district'] ?? $addr['suburb'] ?? $addr['county'] ?? '';
$taluka = sindhi_place(str_replace(array('Taluka', 'Tehsil', ' تعلقو'), '', $talukaRaw));

$out = array(
  "ok" => true,
  "district" => $district,
  "taluka" => $taluka,
  "display_name" => $j['display_name'] ?? '',
  "address" => $addr
);

$json = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
@file_put_contents($cacheFile, $json);
echo $json;
