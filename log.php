<?php
// physics_log.php — receives POST JSON from game, appends to log file
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data) { http_response_code(400); echo 'bad json'; exit; }

$line = date('H:i:s') . ' ' . json_encode($data) . "\n";
file_put_contents(__DIR__ . '/physics_log.txt', $line, FILE_APPEND | LOCK_EX);
echo 'ok';
