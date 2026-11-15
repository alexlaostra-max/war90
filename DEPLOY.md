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
| Адрес игры | http://95.163.222.96/ (домена и HTTPS пока нет) |

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
- Комнаты онлайна хранятся в `/opt/war90/data/rooms.json` и переживают перезапуск. Партии старого формата сохранения сервер при загрузке отбрасывает.

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

## Подключить домен и HTTPS

1. Добавь в DNS домена A-запись на `95.163.222.96`.
2. Когда домен начнёт открываться, впиши его в конфиг и выпусти сертификат. `ДОМЕН` замени на свой:

```bash
sed -i 's/server_name _;/server_name ДОМЕН;/' /etc/nginx/sites-available/war90 && nginx -t && systemctl reload nginx && certbot --nginx -d ДОМЕН
```

HTTPS обязателен, чтобы запускать игру как Telegram Mini App.
