// Сборка: index.html (обычная страница со ссылками на файлы) и dist/artifact.html (всё в одном файле)
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const JS = ['data', 'events', 'geo', 'engine', 'net', 'ui'];
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Mono&family=PT+Sans:wght@400;700&family=Russo+One&display=swap">';
const body = rd('src/body.html');

fs.writeFileSync(path.join(__dirname, 'index.html'),
  '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Передел</title>\n' + FONTS +
  '\n<link rel="stylesheet" href="css/style.css">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + body +
  JS.map(f => '<script src="js/' + f + '.js"></script>').join('\n') + '\n</body>\n</html>\n');

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/artifact.html'),
  '<title>Передел</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + FONTS + '\n<style>\n' + rd('css/style.css') + '</style>\n' + body +
  '<script>\n' + JS.map(f => rd('js/' + f + '.js')).join('\n') + '</script>\n');
console.log('ok');
