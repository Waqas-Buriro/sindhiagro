<?php
header('Content-Type: application/json; charset=utf-8');

function hd_json($data, $code = 200) {
  http_response_code($code);
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
      CURLOPT_USERAGENT => 'HariDost/1.5A',
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
      'header' => "User-Agent: HariDost/1.5A\r\n"
    )
  ));
  return @file_get_contents($url, false, $ctx);
}

$lat = isset($_GET['lat']) ? floatval($_GET['lat']) : 25.3960;
$lon = isset($_GET['lon']) ? floatval($_GET['lon']) : 68.3578;

if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
  hd_json(array("ok"=>false, "message"=>"لوڪيشن درست نه آهي."), 400);
}

$cacheDir = dirname(__DIR__) . '/cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

$key = 'weather_' . round($lat, 2) . '_' . round($lon, 2) . '.json';
$cacheFile = $cacheDir . '/' . preg_replace('/[^a-zA-Z0-9_.-]/', '_', $key);
$ttl = 600;

if (is_file($cacheFile) && (time() - filemtime($cacheFile) < $ttl)) {
  $cached = @file_get_contents($cacheFile);
  if ($cached) {
    header('X-Hari-Dost-Cache: HIT');
    echo $cached;
    exit;
  }
}

$params = http_build_query(array(
  'latitude' => $lat,
  'longitude' => $lon,
  'current' => 'temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover',
  'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  'forecast_days' => 7,
  'timezone' => 'auto'
));

$url = 'https://api.open-meteo.com/v1/forecast?' . $params;
$raw = hd_get($url);
if (!$raw) {
  hd_json(array(
    "ok"=>false,
    "message"=>"موسمي ڊيٽا عارضي طور دستياب ناهي."
  ), 200);
}

$data = json_decode($raw, true);
if (!is_array($data) || !isset($data['daily'])) {
  hd_json(array(
    "ok"=>false,
    "message"=>"موسمي ڊيٽا پڙهڻ ۾ مسئلو ٿيو."
  ), 200);
}

$out = array(
  "ok" => true,
  "source" => "open-meteo",
  "updated" => date('c'),
  "lat" => $lat,
  "lon" => $lon,
  "current" => array(
    "temp" => $data['current']['temperature_2m'] ?? null,
    "humidity" => $data['current']['relative_humidity_2m'] ?? null,
    "wind" => $data['current']['wind_speed_10m'] ?? null,
    "cloud" => $data['current']['cloud_cover'] ?? null
  ),
  "daily" => array()
);

$times = $data['daily']['time'] ?? array();
for ($i=0; $i<count($times); $i++) {
  $out["daily"][] = array(
    "date" => $times[$i],
    "code" => $data['daily']['weather_code'][$i] ?? 0,
    "max" => $data['daily']['temperature_2m_max'][$i] ?? null,
    "min" => $data['daily']['temperature_2m_min'][$i] ?? null,
    "rain" => $data['daily']['precipitation_probability_max'][$i] ?? 0
  );
}

$json = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
@file_put_contents($cacheFile, $json);
header('X-Hari-Dost-Cache: MISS');
echo $json;
