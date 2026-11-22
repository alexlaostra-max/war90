# Где и как развёрнута игра

Боевой сервер игры «Передел». Перед изменениями на сервере прочитай этот файл целиком.

## Сервер

| | |
|---|---|
| Хостинг | облако Reg.ru, регион Москва |
| Система | Ubuntu 24.04 LTS |
| Ресурсы | 2 vCPU, 4 ГБ RAM, 20 ГБ диска |
| IP | 95.163.222.96 |
| Доступ | SSH под `root` |
| Адрес игры | https://peredel-msk.ru/ (старый адрес http://95.163.222.96/ тоже работает) |
| Домен | peredel-msk.ru, регистратор Reg.ru, DNS Reg.ru: A-записи `@` и `www` → 95.163.222.96 |
| HTTPS | Let's Encrypt через certbot, продлевается сам (`certbot renew --dry-run` для проверки) |

В панели Reg.ru включено резервное копирование и есть снэпшоты. Перед рискованными изменениями сделай снэпшот.

## Что установлено

- Node.js 22 (из NodeSource), npm, PM2, Nginx, git, certbot с плагином для Nginx.
- Код игры: `/opt/war90`, клон этого репозитория, ветка `main`.

Если в `/opt/war90` ещё стоит старая ветка `claude/sharp-cori-vzwjfd`, переключи на `main`:

```bash
cd /opt/war90 && git fetch origin main && git checkout main && pm2 restart war90
```

## Как запущена игра

- `server.js` без npm-зависимостей, работает под PM2 с именем `war90`.
- Порт 3090: запущен с `PORT=3090`.
- Автозапуск настроен через `pm2 save` и `pm2 startup` (systemd-юнит `pm2-root`). После перезагрузки сервера игра поднимается сама, это проверено.
- Комнаты онлайна хранятся в `/opt/war90/data/rooms.json` и переживают перезапуск. Партии старого формата сохранения сервер при загрузке отбрасывает. Комната без единого подключённого человека закрывается через 10 минут; в `pm2 logs war90` это видно строкой «комната закрыта, никого нет 10 мин».

## Nginx

Конфиг `/etc/nginx/sites-available/war90`, включён симлинком в `sites-enabled`. Стандартный `default` удалён, это единственный сайт на сервере.

```nginx
server {
    listen 80 default_server;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

Строки `proxy_buffering off`, `proxy_read_timeout 1h`, `proxy_http_version 1.1` и пустой `Connection` обязательны. Состояние игры уходит игрокам потоком Server-Sent Events (`/api/stream`); без них ходы других игроков приходят с задержкой или соединение рвётся.

## Файрвол

`ufw` включён. Разрешены только `OpenSSH` и `Nginx Full` (порты 80 и 443).

## Telegram-бот на этом же сервере

Здесь же работает Telegram-бот владельца. Он не под PM2 (в `pm2 list` только `war90`) и не слушает портов. Как именно он запущен, неизвестно.

**Бота не трогай.** После перезагрузки сервера уточни у владельца, что бот поднялся.

## Частые команды

Обновить игру из `main`:

```bash
cd /opt/war90 && git pull && pm2 restart war90
```

Статус процессов:

```bash
pm2 list
```

Логи игры:

```bash
pm2 logs war90
```

Проверка изнутри сервера. Ответ должен быть вида `{"rooms":[...]}`:

```bash
curl -s http://127.0.0.1/api/rooms
```

Применить изменения в конфиге Nginx:

```bash
nginx -t && systemctl reload nginx
```

## Домен и HTTPS

Домен `peredel-msk.ru` подключён, сертификат Let's Encrypt выпущен через `certbot --nginx` и прописан в `/etc/nginx/sites-enabled/war90`; HTTP перенаправляется на HTTPS. В DNS есть TXT-запись `_globalsign-domain-verification` — это подтверждение домена для сертификата Reg.ru (GlobalSign), он не используется, запись ничему не мешает.

Установка на телефон (PWA) и Telegram Mini App работают только по HTTPS.

Перевыпустить сертификат вручную:

```bash
certbot --nginx -d peredel-msk.ru -d www.peredel-msk.ru
```

## Личный кабинет: вход через Телеграм

Бот @peredelmskbot присылает 6-значный код входа; в мини-приложении Телеграма вход автоматический.
Настройки — в файле `/opt/war90/.env` (в git не попадает):

```
BOT_TOKEN=токен от BotFather
BOT_NAME=peredelmskbot
```

После правки `.env`: `pm2 restart war90`. Аккаунты хранятся в `data/accounts.json`, сохранения — в `data/saves/acc_*.json`.
Бот получает обновления сам (getUpdates), вебхук у бота должен быть выключен.
