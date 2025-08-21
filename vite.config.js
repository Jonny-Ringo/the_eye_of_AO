const { defineConfig } = require('vite');
const { resolve } = require('node:path');

module.exports = defineConfig({
  base: './', // or '/<your-subpath>/' if deploying under a folder
  build: {
    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        uptime:  resolve(__dirname, 'legacynet/uptime.html'),
        globe:   resolve(__dirname, 'hyperbeam/3D-Globe/globe.html'),
        hyperbeam: resolve(__dirname, 'hyperbeam/hyperbeam-uptime.html')
      }
    }
  }
});



