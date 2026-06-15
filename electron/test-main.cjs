const electron = require('electron');
console.log('Type of electron:', typeof electron);
console.log('Has app:', 'app' in electron);
console.log('Has BrowserWindow:', 'BrowserWindow' in electron);
process.exit(0);
