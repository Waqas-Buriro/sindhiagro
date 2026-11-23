<?php
header('Content-Type: application/json; charset=utf-8');
echo json_encode(array(
  "sindhi_sambat" => "10 ڄيٺ 1400",
  "gregorian" => "31 May 2026"
), JSON_UNESCAPED_UNICODE);
