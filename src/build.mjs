import { execSync } from 'child_process';
import fs from 'fs';
execSync('npx esbuild app.jsx --jsx-factory=React.createElement --jsx-fragment=React.Fragment --target=es2020 --minify-whitespace --outfile=app.out.js --log-level=warning', { stdio: 'inherit' });
const logo = 'data:image/png;base64,' + fs.readFileSync('logo1.b64', 'utf8').trim();
const js = fs.readFileSync('app.out.js', 'utf8').replace(/<\/script/gi, '<\\/script').replace('__LOGO__', () => logo);
const css = fs.readFileSync('app.css', 'utf8');
const html = fs.readFileSync('template.html', 'utf8').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
fs.writeFileSync('portfolio-ops-tracker.html', html);
console.log('built', html.length);
