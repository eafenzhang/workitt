console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);
console.log('process.defaultApp:', process.defaultApp);
console.log('__dirname:', __dirname);
console.log('require.resolve("electron"):', require.resolve('electron'));
const electron = require('electron');
console.log('electron type:', typeof electron);
console.log('electron === path-to-exe:', electron === 'C:\\Users\\121212\\workit\\node_modules\\electron\\dist\\electron.exe');
process.exit(0);
