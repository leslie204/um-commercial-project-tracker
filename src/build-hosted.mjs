import fs from 'fs';
const H = '../hosted';
const js = fs.readFileSync('app.out.js', 'utf8').replace(/<\/script/gi, '<\\/script').replace('__LOGO__', () => 'data:image/png;base64,' + fs.readFileSync('logo1.b64', 'utf8').trim());
const shim = fs.readFileSync(H + '/src/shim.js', 'utf8');
const css = fs.readFileSync('app.css', 'utf8');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>UM Commercial Project Tracker</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@300..800&display=swap">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}
${css}</style></head>
<body><div id="root"><div style="padding:32px;font-family:Rubik,Arial,sans-serif;color:#2e2e38;background:#f4f9f6">Loading the project plan…</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${shim}</script>
<script>${js}</script>
</body></html>
`;
fs.writeFileSync(H + '/public/index.html', html);
for (const f of ['app.jsx', 'app.css', 'template.html', 'build.mjs', 'build-hosted.mjs', 'logo1.b64']) fs.copyFileSync(f, H + '/src/' + f);
console.log('hosted', html.length);
