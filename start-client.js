// Wrapper: changes into client directory before starting Vite
process.chdir(__dirname + '/client');
import('./client/node_modules/vite/bin/vite.js');
