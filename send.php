<?php
/**
 * ARTCAMINHO — приём заявок с форм сайта и отправка на e-mail.
 *
 * Работает на любом хостинге с PHP 7.4+ и функцией mail().
 * НАСТРОЙКА — только два адреса ниже.
 */

// Куда приходят заявки — служебная почта магазина, на сайте она не показывается.
// Можно несколько адресов через запятую
const MAIL_TO = 'artcaminho@gmail.com';

// От кого письмо. Должен быть адрес на ВАШЕМ домене сайта (например noreply@artcaminho.ru),
// иначе почтовые сервисы отправят письмо в спам или не примут его.
const MAIL_FROM = 'noreply@artcaminho.ru';

const SITE_NAME = 'ARTCAMINHO';

// Телефон магазина — показывается клиенту, если отправка не удалась
const SHOP_PHONE = '+7 900 000-00-00';

// ---------------------------------------------------------------------------

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Метод не поддерживается']);
}

// Защита от ботов: скрытое поле должно остаться пустым
if (!empty($_POST['website'])) {
    respond(200, ['ok' => true]); // боту делаем вид, что всё хорошо
}

// Защита от слишком частых отправок (1 заявка в 20 секунд с одного IP)
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$lockFile = sys_get_temp_dir() . '/artcaminho_' . md5($ip);
if (is_file($lockFile) && time() - filemtime($lockFile) < 20) {
    respond(429, ['ok' => false, 'error' => 'Слишком часто. Попробуйте через минуту']);
}

$clean = static function ($value, int $max = 500): string {
    $value = trim((string)$value);
    $value = preg_replace('/[\r\n\t]+/', ' ', $value);
    return mb_substr($value, 0, $max, 'UTF-8');
};

$digits = preg_replace('/\D+/', '', (string)($_POST['phone'] ?? ''));
if (strlen($digits) === 11 && $digits[0] === '8') { $digits = '7' . substr($digits, 1); }
$agree  = !empty($_POST['agree']);
$source = $clean($_POST['form'] ?? 'Форма на сайте', 100);
$page   = $clean($_POST['page'] ?? '', 300);

if (strlen($digits) !== 11 || $digits[0] !== '7') {
    respond(422, ['ok' => false, 'error' => 'Введите номер телефона полностью']);
}
$phone = sprintf('+7 (%s) %s-%s-%s', substr($digits, 1, 3), substr($digits, 4, 3), substr($digits, 7, 2), substr($digits, 9, 2));
if (!$agree) {
    respond(422, ['ok' => false, 'error' => 'Нужно согласие на обработку данных']);
}

// Состав корзины (если заявка из корзины)
$cartText = '';
$cart = json_decode((string)($_POST['cart'] ?? ''), true);
if (is_array($cart) && $cart) {
    $total = 0;
    $lines = [];
    foreach (array_slice($cart, 0, 50) as $item) {
        $name  = $clean($item['name'] ?? 'Товар', 120);
        $qty   = max(1, (int)($item['qty'] ?? 1));
        $price = max(0, (int)($item['price'] ?? 0));
        $total += $qty * $price;
        $lines[] = sprintf('— %s × %d = %s ₽', $name, $qty, number_format($qty * $price, 0, '', ' '));
    }
    $cartText = "\nКорзина:\n" . implode("\n", $lines) . "\nИтого: " . number_format($total, 0, '', ' ') . " ₽\n";
}

$subject = SITE_NAME . ': перезвонить ' . $phone . ' — ' . $source;
$body = "Новая заявка с сайта " . SITE_NAME . "\n\n"
      . "Форма: {$source}\n"
      . "Телефон клиента: {$phone}\n"
      . ($page ? "Страница: {$page}\n" : '')
      . $cartText
      . "\nДата: " . date('d.m.Y H:i') . "\nIP: {$ip}\n";

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'From: ' . '=?UTF-8?B?' . base64_encode(SITE_NAME) . '?= <' . MAIL_FROM . '>',
    'X-Mailer: PHP/' . PHP_VERSION,
];

$sent = mail(
    MAIL_TO,
    '=?UTF-8?B?' . base64_encode($subject) . '?=',
    $body,
    implode("\r\n", $headers),
    '-f' . MAIL_FROM
);

if (!$sent) {
    respond(500, ['ok' => false, 'error' => 'Не удалось отправить. Позвоните нам: ' . SHOP_PHONE]);
}

@touch($lockFile);
respond(200, ['ok' => true]);
