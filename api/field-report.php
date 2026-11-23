<?php
header('Content-Type: application/json; charset=utf-8');

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = $_GET;

$temp = isset($input['temp']) ? floatval($input['temp']) : null;
$humidity = isset($input['humidity']) ? floatval($input['humidity']) : null;
$rain = isset($input['rain']) ? floatval($input['rain']) : null;
$wind = isset($input['wind']) ? floatval($input['wind']) : null;

$lines = array("ادا،");

if ($temp !== null) {
  if ($temp >= 43) $lines[] = "گرمي وڌيل آهي؛ فصل ۽ ٻنيءَ جي آلاڻ تي خاص نظر رکو.";
  elseif ($temp >= 38) $lines[] = "گرمي ڪجهه وڌيل آهي؛ ڏينھن جي وچ واري وقت پاڻي ڏيڻ کان پاسو ڪريو.";
  else $lines[] = "گرمي هن وقت برداشت جهڙي آهي.";
}

if ($rain !== null) {
  if ($rain >= 60) $lines[] = "مينھن جا امڪان وڌيل آهن؛ پاڻي ڏيڻ جو فيصلو احتياط سان ڪريو.";
  elseif ($rain >= 30) $lines[] = "مينھن جو ٿورو امڪان آهي؛ ٻني ڏسي پوءِ پاڻي ڏيو.";
  else $lines[] = "مينھن جا امڪان گهٽ آهن.";
}

if ($humidity !== null) {
  if ($humidity >= 70) $lines[] = "هوا ۾ گهم وڌيڪ آهي؛ ٻنيءَ جي آلاڻ گهڻي دير رهي سگهي ٿي.";
  elseif ($humidity <= 30) $lines[] = "هوا خشڪ آهي؛ آلاڻ جلدي گهٽجي سگهي ٿي.";
  else $lines[] = "آلاڻ بابت صورتحال وچولي لڳي ٿي.";
}

if ($wind !== null && $wind >= 30) {
  $lines[] = "هوا تيز ٿي سگهي ٿي؛ اسپري يا هلڪي ڪم ۾ احتياط ڪريو.";
}

echo json_encode(array(
  "status" => "ok",
  "title" => "اوھان جي ٻنيءَ جي تازي رپورٽ",
  "summary" => implode("\n\n", $lines)
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
