const electron = require('electron');
console.log('electron keys:', Object.keys(electron).slice(0, 10).join(', '));
console.log('app:', typeof electron.app);
console.log('app.whenReady:', typeof electron.app?.whenReady);
